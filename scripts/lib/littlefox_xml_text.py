"""Use Little Fox's original XML Paragraph/Text only as the transcript authority.

Do NOT read Number, StartMilliseconds, EndMilliseconds, or any XML time value.
Video audio and WhisperX remain the sole source of subtitle timestamps.
"""
import hashlib
import re
import unicodedata
from urllib.request import Request, build_opener, HTTPRedirectHandler
from urllib.parse import urlparse
import xml.etree.ElementTree as ET

HOST="cdn.littlefox.com"
CONTENT_ID=re.compile(r"C[0-9]{7}\Z")
TOKEN=re.compile(r"\S+",re.UNICODE)

def clean(value):
    value=re.sub(r"\[n@(?:\])?"," ",str(value or ""),flags=re.IGNORECASE)
    # Inline g/i tags are formatting, not spoken words. Keep adjacent letters intact.
    value=re.sub(r"\[(?:g|i)@|@(?:g|i)\]","",value,flags=re.IGNORECASE)
    return re.sub(r"\s+"," ",value).strip()

def normalized(token):
    return "".join(ch for ch in unicodedata.normalize("NFKC",token.lower()) if ch.isalnum())

def spoken_tokens(text):
    # Excludes scene separators like *** and other punctuation-only markers.
    return [word for word in TOKEN.findall(clean(text)) if normalized(word)]

def parse_text_only(xml_bytes):
    if not isinstance(xml_bytes,bytes) or not 20<len(xml_bytes)<=2_000_000:
        raise ValueError("Official caption XML is empty or too large")
    if b"<!DOCTYPE" in xml_bytes.upper() or b"<!ENTITY" in xml_bytes.upper():
        raise ValueError("Unsupported XML entities")
    root=ET.fromstring(xml_bytes)
    def tag(element):
        return element.tag.rsplit("}",1)[-1]
    if tag(root).lower()!="subtitle":
        raise ValueError("Response is not the expected Little Fox Subtitle XML")
    texts=[]
    for paragraph in root.iter():
        if tag(paragraph).lower()!="paragraph":continue
        for child in paragraph:
            if tag(child).lower()=="text":
                value=clean(" ".join(child.itertext()))
                if value:texts.append(value)
                break
    # Letter-learning shorts can legitimately have one paragraph and only
    # a handful of spoken words. A universal 25-word/3-paragraph gate
    # incorrectly rejects the whole ABC Book series before audio verification.
    if not texts:
        raise ValueError("Official XML has no Text paragraphs")
    words=spoken_tokens(" ".join(texts))
    if not words:
        raise ValueError("Official XML has no spoken text")
    return {"paragraphs":len(texts),"words":words,
            "sha256":hashlib.sha256(" ".join(words).encode("utf-8")).hexdigest()}

class SameHostRedirect(HTTPRedirectHandler):
    def redirect_request(self,request,fp,code,message,headers,new_url):
        parsed=urlparse(new_url)
        if parsed.scheme!="https" or parsed.hostname!=HOST or parsed.username or parsed.password or parsed.port:
            raise ValueError("Caption XML redirected outside the approved Little Fox CDN")
        return super().redirect_request(request,fp,code,message,headers,new_url)

def download_xml(content_id,timeout=22):
    if not isinstance(content_id,str) or not CONTENT_ID.fullmatch(content_id):
        raise ValueError("Official caption content ID is missing or invalid")
    url=f"https://{HOST}/contents/caption/{content_id}.xml"
    opener=build_opener(SameHostRedirect)
    with opener.open(Request(url,headers={
        "User-Agent":"yqxyy-whisperx-xml-text-only/1.0",
        "Accept":"application/xml,text/xml"
    }),timeout=timeout) as response:
        body=response.read(2_000_001)
    if len(body)>2_000_000:raise ValueError("Official XML response exceeds 2 MB")
    return url,body
