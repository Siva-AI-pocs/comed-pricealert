"""ESPI (Green Button) XML parser.

Yields source-agnostic interval tuples so any caller — manual upload,
Bayou Energy sync, direct CMD OAuth — can feed the same ingest pipeline.
"""
from __future__ import annotations

import io
import re
import zipfile
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Iterator
from xml.etree import ElementTree as ET

# ESPI uses Atom + an espi namespace. Element names use Clark notation
# in ElementTree, so we strip namespaces while iterating to keep matching
# simple and tolerant of slight variations (espi/ns0/etc.).
_TAG_RE = re.compile(r"^\{[^}]+\}")


def _local(tag: str) -> str:
    return _TAG_RE.sub("", tag)


@dataclass(frozen=True)
class IntervalTuple:
    usage_point_id: str
    start_utc: datetime
    duration_seconds: int
    wh: int


def parse_espi(payload: bytes) -> Iterator[IntervalTuple]:
    """Parse ESPI XML (or ZIP-wrapped XML) and yield IntervalTuple rows.

    Accepts:
      - Raw ESPI Atom XML (UTF-8 bytes)
      - ZIP archive containing one or more .xml files (Green Button bulk export)
    """
    if payload[:2] == b"PK":
        with zipfile.ZipFile(io.BytesIO(payload)) as zf:
            for name in zf.namelist():
                if not name.lower().endswith(".xml"):
                    continue
                with zf.open(name) as f:
                    yield from _parse_xml(f.read())
        return
    yield from _parse_xml(payload)


def _parse_xml(xml_bytes: bytes) -> Iterator[IntervalTuple]:
    root = ET.fromstring(xml_bytes)
    # Track the most-recently-seen UsagePoint id so IntervalBlocks attribute
    # to the right meter. ESPI Atom entries carry the UsagePoint id in the
    # entry's <link rel="self" href=".../UsagePoint/<id>"/> or in the
    # IntervalBlock's parent MeterReading's self link. We walk entries in
    # document order, capturing whichever appears most recently.
    current_usage_point = "default"

    for entry in root.iter():
        tag = _local(entry.tag)
        if tag == "entry":
            for link in entry.iter():
                if _local(link.tag) != "link":
                    continue
                rel = link.attrib.get("rel", "")
                href = link.attrib.get("href", "")
                if rel == "self" and "/UsagePoint/" in href:
                    m = re.search(r"/UsagePoint/([^/?#]+)", href)
                    if m:
                        current_usage_point = m.group(1)
            for block in entry.iter():
                if _local(block.tag) == "IntervalBlock":
                    yield from _parse_interval_block(block, current_usage_point)


def _parse_interval_block(block: ET.Element, usage_point_id: str) -> Iterator[IntervalTuple]:
    for reading in block:
        if _local(reading.tag) != "IntervalReading":
            continue
        start = duration = value = None
        for child in reading:
            ctag = _local(child.tag)
            if ctag == "timePeriod":
                for tp in child:
                    if _local(tp.tag) == "start":
                        start = int(tp.text)
                    elif _local(tp.tag) == "duration":
                        duration = int(tp.text)
            elif ctag == "value":
                value = int(child.text)
        if start is None or duration is None or value is None:
            continue
        yield IntervalTuple(
            usage_point_id=usage_point_id,
            start_utc=datetime.fromtimestamp(start, tz=timezone.utc).replace(tzinfo=None),
            duration_seconds=duration,
            wh=value,
        )
