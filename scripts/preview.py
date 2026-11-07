from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
import re


class PreviewHandler(SimpleHTTPRequestHandler):
    """Serve local files and the site's fixed Netlify PDF download endpoint."""
    def do_GET(self):
        if not self.path.startswith('/book-download/'):
            return super().do_GET()
        if not re.fullmatch(r'/book-download/[a-z0-9-]+\.pdf', self.path):
            return self.send_error(404)
        try:
            request = Request('https://yqxyy.netlify.app' + self.path,
                              headers={'User-Agent': 'StoryFox-Local-Preview'})
            with urlopen(request, timeout=90) as upstream:
                first = upstream.read(1024)
                if b'%PDF-' not in first:
                    return self.send_error(502, 'Download service did not return a PDF')
                self.send_response(200)
                self.send_header('Content-Type', 'application/pdf')
                self.send_header('Cache-Control', 'no-store')
                self.end_headers()
                self.wfile.write(first)
                while chunk := upstream.read(65536):
                    self.wfile.write(chunk)
        except HTTPError as error:
            self.send_error(error.code)
        except URLError:
            self.send_error(502, 'PDF download service unavailable')
        except (BrokenPipeError, ConnectionResetError):
            pass


if __name__ == '__main__':
    root = Path(__file__).resolve().parent.parent
    print('Local preview: http://127.0.0.1:8000/#/home', flush=True)
    ThreadingHTTPServer(('127.0.0.1', 8000),
                        partial(PreviewHandler, directory=str(root))).serve_forever()
