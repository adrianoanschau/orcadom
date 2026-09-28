import unittest
from urllib.parse import urlparse

from sentry_event import parse_dsn


class ParseDsnTest(unittest.TestCase):
    def test_rewrites_localhost_for_docker(self) -> None:
        store, key, scheme = parse_dsn("http://public@localhost:8000/3")
        self.assertEqual(key, "public")
        self.assertEqual(scheme, "http")
        parsed = urlparse(store)
        self.assertEqual(parsed.hostname, "host.docker.internal")
        self.assertEqual(parsed.port, 8000)
        self.assertEqual(parsed.path, "/api/3/store/")

    def test_keeps_remote_host(self) -> None:
        store, key, _scheme = parse_dsn("https://abc@sentry.example/12")
        self.assertEqual(key, "abc")
        self.assertEqual(store, "https://sentry.example/api/12/store/")


if __name__ == "__main__":
    unittest.main()
