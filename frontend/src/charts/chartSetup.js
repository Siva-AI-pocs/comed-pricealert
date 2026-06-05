// Single place that registers Chart.js + the zoom and annotation plugins
// (matching the legacy dashboard's drag-zoom and zero-line behaviours).
// Components import { Chart } from here; tests mock this module.
import { Chart, registerables } from "chart.js";
import zoomPlugin from "chartjs-plugin-zoom";
import annotationPlugin from "chartjs-plugin-annotation";

Chart.register(...registerables, zoomPlugin, annotationPlugin);

export { Chart };
