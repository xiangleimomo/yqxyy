import json,urllib.parse,urllib.request
samples=[
 "The Goblet of Fire has chosen four champions.",
 "You have to be brave.",
 "Harry, are you all right?",
 "The Dark Lord has returned.",
 "This is the Triwizard Tournament."
]
params=[("client","gtx"),("sl","en"),("tl","zh-CN"),("dt","t")]+[("q",s) for s in samples]
url="https://translate.googleapis.com/translate_a/single?"+urllib.parse.urlencode(params)
req=urllib.request.Request(url,headers={"User-Agent":"Mozilla/5.0"})
with urllib.request.urlopen(req,timeout=20) as r:
    data=json.loads(r.read().decode("utf-8"))
print(json.dumps({"responseType":type(data).__name__,"outerLength":len(data),"raw":data},ensure_ascii=False)[:5000])
