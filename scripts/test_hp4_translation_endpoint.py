import json,urllib.parse,urllib.request
samples=[
 "The Goblet of Fire has chosen four champions.",
 "You have to be brave.",
 "Harry, are you all right?",
 "The Dark Lord has returned.",
 "This is the Triwizard Tournament."
]
for s in samples:
    q=urllib.parse.urlencode({"client":"gtx","sl":"en","tl":"zh-CN","dt":"t","q":s})
    req=urllib.request.Request("https://translate.googleapis.com/translate_a/single?"+q,headers={"User-Agent":"Mozilla/5.0"})
    with urllib.request.urlopen(req,timeout=20) as r:
        data=json.loads(r.read().decode("utf-8"))
    translated="".join(x[0] for x in data[0] if x and x[0])
    print(json.dumps({"en":s,"zh":translated},ensure_ascii=False))
