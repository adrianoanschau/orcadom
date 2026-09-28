import tempfile
import unittest
from pathlib import Path
from unittest import mock

import metrics


class MetricsTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        patcher = mock.patch.object(metrics, "STATE_DIR", Path(self.tmp.name))
        patcher.start()
        self.addCleanup(patcher.stop)
        patcher_state = mock.patch.object(metrics, "STATE_PATH", Path(self.tmp.name) / "state.json")
        patcher_state.start()
        self.addCleanup(patcher_state.stop)
        patcher_prom = mock.patch.object(metrics, "PROM_PATH", Path(self.tmp.name) / "metrics.prom")
        patcher_prom.start()
        self.addCleanup(patcher_prom.stop)

    def test_increments_and_renders_prometheus(self) -> None:
        metrics.init_exporter()
        metrics.inc_run("dump", "success")
        metrics.inc_run("dump", "failure")
        metrics.set_gauge("last_success", "dump", 1700000000)
        metrics.set_gauge("last_size", "dump", 4096)
        metrics.set_gauge("retained", "daily", 7)
        text = metrics.prometheus_text()
        self.assertIn("orcadom_backup_up 1", text)
        self.assertIn('orcadom_backup_runs_total{job="dump",result="success"} 1', text)
        self.assertIn('orcadom_backup_runs_total{job="dump",result="failure"} 1', text)
        self.assertIn('orcadom_backup_last_success_timestamp{job="dump"} 1700000000.0', text)
        self.assertIn('orcadom_backup_last_size_bytes{job="dump"} 4096', text)
        self.assertIn('orcadom_backup_objects_retained{slot="daily"} 7', text)


if __name__ == "__main__":
    unittest.main()
