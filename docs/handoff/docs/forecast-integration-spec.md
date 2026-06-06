# ComEd Price Pulse — Price Forecast Integration Spec

**Goal:** Add a probabilistic 24–48h real-time price forecast to the existing app, integrated into the FastAPI backend, PostgreSQL, and React frontend, deployable on Render.

**Stack assumptions (adapt to actual repo layout):**
FastAPI backend · React frontend · PostgreSQL · Render hosting · existing ComEd hourly-pricing fetcher · existing Chart.js dashboard.

---

## 0. Architecture — train offline, serve light

Render can't train or hold a heavy model in memory cheaply. So:

```
[Home lab: Zone A/C]                         [Render: existing app]
  train_forecast.py        model.pkl          forecast_service.py  ──► price_forecast (Postgres)
  (gridstatus backfill,  ──(commit/upload)──►  (loads model,                ▲
   LightGBM quantile)                           predicts 48h hourly)        │ hourly job
                                                                  GET /api/forecast ──► React ForecastTab
```

- **Training** runs on the home lab (has the RAM/CPU). Output is a small `model.pkl` (LightGBM is a few MB).
- **Render** only *loads + predicts*. An hourly worker recomputes the 48h forecast and writes rows to `price_forecast`.
- The **API reads the table** — no model on the request path, so the endpoint is fast and Render stays cheap.

> Why this matters: it decouples the expensive part (training, backfilling 2 yrs of PJM data) from the always-on part (serving), and lets you iterate on the model without redeploying the app.

---

## 1. Data sources (all free)

| Source | What | How |
|---|---|---|
| ComEd hourly pricing API | RT 5-min + hour-avg (billing price) | already pulled — keep storing it |
| PJM Data Miner 2 `da_hrl_lmps` | day-ahead hourly LMP, ComEd **zone** | via `gridstatus` `get_lmp(market="DAY_AHEAD_HOURLY", location_type="ZONE")` |
| PJM Data Miner 2 `load_frcstd_7_day` | 7-day load forecast | `gridstatus` / Data Miner API |
| Open-Meteo | Chicago temp / HDD-CDD | free, no key |

`gridstatus` archive: ~2 yrs hourly DA/RT, ~186 days for 5-min — backfill once.

---

## 2. Database — new table (Alembic migration)

```sql
CREATE TABLE price_forecast (
    id            BIGSERIAL PRIMARY KEY,
    target_ts     TIMESTAMPTZ NOT NULL,      -- the hour being predicted
    p10           NUMERIC(7,2) NOT NULL,      -- cents/kWh, lower band
    p50           NUMERIC(7,2) NOT NULL,      -- median forecast
    p90           NUMERIC(7,2) NOT NULL,      -- upper band
    spike_prob    NUMERIC(4,3),               -- P(price > 10c)
    da_lmp        NUMERIC(7,2),               -- PJM day-ahead, for comparison overlay
    model_version TEXT NOT NULL,
    generated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (target_ts, generated_at)
);
CREATE INDEX idx_forecast_target ON price_forecast (target_ts);

-- optional: keep settled actuals to score accuracy
CREATE TABLE price_actual (
    target_ts  TIMESTAMPTZ PRIMARY KEY,
    rt_price   NUMERIC(7,2) NOT NULL          -- settled real-time hourly
);
```

---

## 3. Backend — training (home lab) `ml/train_forecast.py`

```python
"""Offline. Run on the home lab. Outputs model.pkl + feature config."""
import gridstatus, pandas as pd, lightgbm as lgb, joblib, requests
from datetime import datetime, timedelta

ZONE = "COMED"                       # PJM transmission zone
QUANTILES = {"p10": 0.10, "p50": 0.50, "p90": 0.90}

def load_history(start, end):
    iso = gridstatus.PJM()
    rt = iso.get_lmp(start=start, end=end, market="REAL_TIME_HOURLY",
                     location_type="ZONE")        # filter to COMED
    da = iso.get_lmp(start=start, end=end, market="DAY_AHEAD_HOURLY",
                     location_type="ZONE")
    rt = rt[rt["Location"] == ZONE]; da = da[da["Location"] == ZONE]
    # weather: Open-Meteo Chicago hourly temp (join on hour)
    # load forecast: PJM load_frcstd_7_day (join on hour)
    return rt, da  # TODO: merge weather + load into one frame

def make_features(df):
    """df indexed by hour with: rt_price, da_lmp, temp, load_fcst."""
    df["lag_1h"]   = df["rt_price"].shift(1)
    df["lag_24h"]  = df["rt_price"].shift(24)
    df["lag_168h"] = df["rt_price"].shift(168)
    df["hour"] = df.index.hour
    df["dow"]  = df.index.dayofweek
    df["is_weekend"] = (df["dow"] >= 5).astype(int)
    df["month"] = df.index.month
    # KEY: day-ahead is the anchor; model learns the DA->RT correction
    feats = ["da_lmp","load_fcst","temp","lag_1h","lag_24h","lag_168h",
             "hour","dow","is_weekend","month"]
    return df.dropna(), feats

def train():
    rt, da = load_history(datetime.now()-timedelta(days=730), datetime.now())
    df, feats = make_features(rt)               # TODO merge da/weather/load first
    X, y = df[feats], df["rt_price"]
    models = {}
    for name, q in QUANTILES.items():
        m = lgb.LGBMRegressor(objective="quantile", alpha=q,
                              n_estimators=600, learning_rate=0.03,
                              num_leaves=64, min_child_samples=50)
        m.fit(X, y)
        models[name] = m
    # spike classifier: P(price > 10c)
    clf = lgb.LGBMClassifier(n_estimators=400, learning_rate=0.03)
    clf.fit(X, (y > 10).astype(int))
    joblib.dump({"quantiles": models, "spike": clf, "features": feats,
                 "version": datetime.now().strftime("v%Y%m%d")}, "model.pkl")

if __name__ == "__main__":
    train()
```

**Evaluation (do NOT use MAPE — negative prices):** walk-forward backtest, report **MAE / RMSE / sMAPE**, **pinball loss** for the bands, and **precision/recall** on the spike flag — always next to the naive day-ahead baseline so the edge is quantified.

---

## 4. Backend — serving `app/services/forecast_service.py`

```python
import joblib, pandas as pd
from datetime import datetime, timedelta

_BUNDLE = joblib.load("model.pkl")   # loaded once at startup

def build_future_features(db) -> pd.DataFrame:
    """Assemble the next 48 hourly rows: da_lmp (PJM), load_fcst (PJM),
    temp (Open-Meteo), and price lags from stored RT history."""
    ...  # TODO: pull from price_actual + cached PJM/weather fetches
    return future_df

def compute_forecast(db) -> list[dict]:
    X = build_future_features(db)
    feats = _BUNDLE["features"]
    out = []
    for ts, row in X.iterrows():
        xr = row[feats].to_frame().T
        rec = {
            "target_ts": ts,
            "p10": float(_BUNDLE["quantiles"]["p10"].predict(xr)[0]),
            "p50": float(_BUNDLE["quantiles"]["p50"].predict(xr)[0]),
            "p90": float(_BUNDLE["quantiles"]["p90"].predict(xr)[0]),
            "spike_prob": float(_BUNDLE["spike"].predict_proba(xr)[0][1]),
            "da_lmp": float(row["da_lmp"]),
            "model_version": _BUNDLE["version"],
        }
        out.append(rec)
    return out
```

### Hourly refresh job (reuse existing scheduler / cron worker)

```python
def refresh_forecast_job(db):
    rows = compute_forecast(db)
    gen = datetime.utcnow()
    for r in rows:
        r["generated_at"] = gen
    db.bulk_insert(PriceForecast, rows)   # upsert on (target_ts, generated_at)
```

### API route `app/api/forecast.py`

```python
from fastapi import APIRouter, Depends
router = APIRouter(prefix="/api")

@router.get("/forecast")
def get_forecast(hours: int = 48, db=Depends(get_db)):
    """Latest forecast for the next N hours (reads table, no model)."""
    return db.query(PriceForecast)\
             .filter(PriceForecast.target_ts >= now())\
             .order_by(PriceForecast.generated_at.desc(),
                       PriceForecast.target_ts.asc())\
             .limit(hours).all()
```

Response shape:
```json
[{"target_ts":"2026-05-31T01:00:00Z","p10":0.6,"p50":1.0,"p90":1.6,
  "spike_prob":0.02,"da_lmp":1.1,"model_version":"v20260530"}]
```

---

## 5. Frontend — new React tab

- Add a **Forecast** tab to the existing dashboard nav.
- Fetch `GET /api/forecast?hours=48`.
- Render with your existing Chart.js: P10–P90 as a filled band, P50 as the line (color by tier), `da_lmp` as a dashed overlay, a horizontal spike-threshold line, plus forecast-driven "cheapest window tomorrow" cards and a spike-risk strip.
- Visual reference: `comed-forecast-view.html` (the mockup) — same band/overlay/accuracy-badge layout, just swap mock arrays for the API response.

---

## 6. Build order (each ships independently)

1. **v0 baseline** — store RT actuals + PJM day-ahead; compute day-ahead's error vs settled RT. This number is the bar to beat (and your marketing line).
2. **v1 LEAR** (Lasso-AR) — fast, daily recalibration; backtest vs v0.
3. **v2 LightGBM quantile** (this spec) — P10/P50/P90 + spike prob.
4. Wire `/api/forecast` → React tab.
5. Hourly refresh job + accuracy scoring (`price_actual` join).
6. Only then: automation (webhook → IFTTT → Home Assistant forecast endpoint).

## 7. TODO

- [ ] Alembic migration: `price_forecast`, `price_actual`
- [ ] `gridstatus` backfill script (ComEd zone, 2 yrs RT + DA)
- [ ] `ml/train_forecast.py` — merge weather + load; LightGBM quantile + spike
- [ ] Backtest harness (MAE/RMSE/sMAPE/pinball + spike P/R vs day-ahead baseline)
- [ ] `forecast_service.py` + `build_future_features`
- [ ] `GET /api/forecast` route
- [ ] Hourly refresh worker
- [ ] React Forecast tab (band + DA overlay + plan cards + risk strip)
- [ ] Model artifact deploy path (home lab → Render)
- [ ] Calibration check (do P10–P90 bands cover ~80%?)
