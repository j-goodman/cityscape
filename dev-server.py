#!/usr/bin/env python3

from __future__ import annotations

import http.server
import socketserver
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent
DEFAULT_PORT = 8080
MAX_PORT = 8090


class NoCacheRequestHandler(http.server.SimpleHTTPRequestHandler):
  def __init__(self, *args, directory=None, **kwargs):
    super().__init__(*args, directory=directory or str(ROOT), **kwargs)

  def end_headers(self):
    self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
    self.send_header('Pragma', 'no-cache')
    self.send_header('Expires', '0')
    super().end_headers()


class ThreadingDevServer(socketserver.ThreadingTCPServer):
  allow_reuse_address = True


def bind_server(requested_port: int, handler_factory):
  for port in range(requested_port, MAX_PORT + 1):
    try:
      return ThreadingDevServer(('127.0.0.1', port), handler_factory), port
    except OSError:
      continue

  fallback_server = ThreadingDevServer(('127.0.0.1', 0), handler_factory)
  return fallback_server, fallback_server.server_address[1]


def main() -> int:
  requested_port = int(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PORT
  handler_factory = lambda *args, **kwargs: NoCacheRequestHandler(*args, directory=str(ROOT), **kwargs)
  server, port = bind_server(requested_port, handler_factory)

  if port != requested_port:
    print(f'Port {requested_port} is busy, using {port} instead.')

  print(f'Open http://127.0.0.1:{port}/.\n')

  with server:
    try:
      server.serve_forever()
    except KeyboardInterrupt:
      print('\nStopping dev server.')

  return 0


if __name__ == '__main__':
  raise SystemExit(main())