"""Conservative timestamp repair from independently recognized speech.
Canonical wording is never replaced by ASR output. Low confidence fails closed.
"""
import difflib, re, statistics

def tokens(text):
    text=re.sub(r'^[A-Z][A-Za-z .-]{0,26}:\s*','',text.strip())
    return re.findall(r'[a-z0-9]+',text.replace('’',"'").lower())

def millis(value):
    h,m,s=value.strip().split(':');return round((int(h)*3600+int(m)*60+float(s))*1000)

def parse_vtt(text):
    cues=[]
    for block in text.replace('\r','').strip().split('\n\n'):
        lines=block.splitlines();i=next((i for i,l in enumerate(lines) if '-->' in l),None)
        if i is None:continue
        a,b=lines[i].split('-->');t=' '.join(lines[i+1:]).strip()
        if re.fullmatch(r'\[caption_out@\]?',t,re.I):continue
        cues.append(dict(startMs=millis(a),endMs=millis(b.split()[0]),text=t))
    return cues

def timestamp(n):
    n=max(0,round(n));return f'{n//3600000:02}:{n%3600000//60000:02}:{n%60000//1000:02}.{n%1000:03}'

def to_vtt(cues):
    return 'WEBVTT\n\n'+'\n\n'.join(f"{i+1}\n{timestamp(c['startMs'])} --> {timestamp(c['endMs'])}\n{c['text']}" for i,c in enumerate(cues))+'\n'

def match_cues(cues,words):
    expected=[];bounds=[];actual=[];times=[]
    for c in cues:
        a=len(expected);expected.extend(tokens(c['text']));bounds.append((a,len(expected)))
    for w in words:
        for t in tokens(w['word']):actual.append(t);times.append((round(w['start']*1000),round(w['end']*1000),w['probability']))
    mapping={}
    for block in difflib.SequenceMatcher(None,expected,actual,autojunk=False).get_matching_blocks():
        for n in range(block.size):mapping[block.a+n]=times[block.b+n]
    rows=[]
    for c,(a,b) in zip(cues,bounds):
        hits=[mapping[i] for i in range(a,b) if i in mapping];r=dict(**c,wordCount=b-a,coverage=len(hits)/max(1,b-a),edgeWordsMatched=a in mapping and b-1 in mapping,firstWordMatched=a in mapping,lastWordMatched=b-1 in mapping)
        if hits:r.update(speechStartMs=hits[0][0],speechEndMs=hits[-1][1],confidence=sum(t[2] for t in hits)/len(hits))
        rows.append(r)
    return len(mapping)/max(1,len(expected)),rows

def strong(row):
    return row['coverage']>=.85 and row['edgeWordsMatched'] and row.get('confidence',0)>=.8 and row.get('speechEndMs',0)>row.get('speechStartMs',0)


def restore_read_insertions(cues,paragraphs,words):
    """Restore a few internally omitted names only with exact public Read and
    independently recognized words. Retain source sentence grouping/times.
    Headings, boundary additions and substitutions require separate review.
    """
    canonical=' '.join(p['text'] if isinstance(p,dict) else p for p in paragraphs)
    read_matches=list(re.finditer(r'[a-z0-9]+',canonical.lower()))
    expected=[m.group() for m in read_matches];source=[];positions=[]
    for index,cue in enumerate(cues):
        for match in re.finditer(r'[a-z0-9]+',cue['text'].lower()):source.append(match.group());positions.append((index,match.start(),match.end()))
    edits=[op for op in difflib.SequenceMatcher(None,source,expected,autojunk=False).get_opcodes() if op[0]!='equal']
    if not edits:return cues,[]
    if any(tag!='insert' or j-i>5 or a==0 or a==len(source) for tag,a,b,i,j in edits):return cues,[]
    if sum(j-i for _,_,_,i,j in edits)>min(20,len(expected)*.02):return cues,[]
    actual=[];confidence=[]
    for word in words:
        for match in re.finditer(r'[a-z0-9]+',word['word'].lower()):actual.append(match.group());confidence.append(word['probability'])
    recognized={}
    for block in difflib.SequenceMatcher(None,expected,actual,autojunk=False).get_matching_blocks():
        for n in range(block.size):recognized[block.a+n]=confidence[block.b+n]
    changes=[]
    for _,a,b,i,j in edits:
        left,right=positions[a-1],positions[a]
        if left[0]!=right[0] or any(recognized.get(k,0)<.75 for k in range(i,j)):return cues,[]
        text=canonical[read_matches[i-1].end():read_matches[j].start()]
        changes.append(dict(cue=left[0],start=left[2],end=right[1],text=text,insertedWords=expected[i:j]))
    result=[dict(c) for c in cues]
    for change in sorted(changes,key=lambda c:(c['cue'],c['start']),reverse=True):
        index=change['cue'];text=result[index]['text'];result[index]['text']=text[:change['start']]+change['text']+text[change['end']:]
    if tokens(' '.join(c['text'] for c in result))!=tokens(canonical):return cues,[]
    return result,[dict(cue=c['cue']+1,insertedWords=c['insertedWords']) for c in changes]

def fit_offset(rows):
    intervals=[]
    for r in rows:
        if not strong(r) or r['wordCount']<3:continue
        low=r['speechEndMs']-r['endMs']-180;high=r['speechStartMs']-r['startMs']+180
        if low<=high and high-low<=10000:intervals.append((low,high,min(12,r['wordCount'])))
    if len(intervals)<4:return 0,0
    events={}
    for a,b,w in intervals:events[a]=events.get(a,0)+w;events[b]=events.get(b,0)-w
    points=sorted(events);score=0;best=-1;regions=[]
    for a,b in zip(points,points[1:]):
        score+=events[a]
        if score>best:best=score;regions=[(a,b)]
        elif score==best:regions.append((a,b))
    target=statistics.median((a+b)/2 for a,b,w in intervals)
    region=min(regions,key=lambda p:abs((p[0]+p[1])/2-target));offset=round(((region[0]+region[1])/2)/10)*10
    support=best/sum(w for a,b,w in intervals)
    return (0 if abs(offset)<800 else offset),support

def align_cues(cues,words,duration_ms,require_offset=True):
    coverage,rows=match_cues(cues,words)
    if coverage<.8:raise ValueError(f'Insufficient transcript/audio coverage: {coverage:.3f}')
    anchored=sum(strong(r) for r in rows)
    offset,support=fit_offset(rows)
    if anchored<max(4,len(rows)*.45) and not(offset==0 and support>=.85 and anchored>=max(4,len(rows)*.4)):raise ValueError('Insufficient independent speech boundaries')
    if abs(offset)>60000 or offset and support<.6:raise ValueError(f'Inconsistent timing shift: {offset} ms, support {support:.2f}')
    result=[];changes=[]
    for index,r in enumerate(rows):
        start=r['startMs']+offset;end=r['endMs']+offset;method='source+verified-offset' if offset else 'source'
        if strong(r) and (offset or abs(start-r['speechStartMs'])>1000 or abs(end-r['speechEndMs'])>1500 or end>duration_ms or not require_offset):
            start=max(0,r['speechStartMs']-120);end=min(duration_ms-40,r['speechEndMs']+180);method='speech-boundaries'
        if start<0 or end>duration_ms+500 or end<=start:raise ValueError(f'Unresolved bounds at cue {index+1}')
        end=min(duration_ms-20,end)
        if result and start<result[-1]['endMs']:
            if start<=result[-1]['startMs']+80:raise ValueError(f'Unresolved cue order at {index+1}')
            result[-1]['endMs']=start-1
        result.append(dict(startMs=round(start),endMs=round(end),text=r['text']))
        changes.append(dict(index=index+1,method=method,coverage=round(r['coverage'],4),confidence=round(r.get('confidence',0),4),speechStartMs=r.get('speechStartMs'),speechEndMs=r.get('speechEndMs')))
    for i,c in enumerate(result):
        if c['endMs']<=c['startMs'] or i and c['startMs']<result[i-1]['endMs']:raise ValueError('Invalid corrected cue boundaries')
    return result,dict(coverage=round(coverage,4),strongCues=anchored,totalCues=len(cues),offsetMs=offset,offsetConsensus=round(support,4),cueChecks=changes)


def align_read(paragraphs,words,duration_ms):
    cues=[dict(startMs=0,endMs=1,text=p['text'] if isinstance(p,dict) else p) for p in paragraphs if tokens(p['text'] if isinstance(p,dict) else p)]
    coverage,rows=match_cues(cues,words)
    if coverage<.9 or sum(strong(r) for r in rows)<len(rows)*.7:raise ValueError('Insufficient full-Read/audio agreement')
    result=[];checks=[]
    for i,r in enumerate(rows):
        if r['coverage']<.7 or r.get('confidence',0)<.8 or 'speechStartMs' not in r:raise ValueError('Uncertain Read paragraph '+str(i+1))
        start=r['speechStartMs'];end=r['speechEndMs'];method='speech-boundaries'
        if not r['firstWordMatched']:
            lower=rows[i-1].get('speechEndMs',0) if i else max(0,start-1500)
            gap=[w for w in words if round(w['start']*1000)>=lower and round(w['end']*1000)<=start and round(w['end']*1000)>lower]
            start=round(gap[0]['start']*1000) if gap else max(lower+1,start-800);method='bounded-speech-edge'
        if not r['lastWordMatched']:
            upper=rows[i+1].get('speechStartMs',duration_ms) if i+1<len(rows) else min(duration_ms,end+1500)
            gap=[w for w in words if round(w['start']*1000)>=end and round(w['end']*1000)<=upper and round(w['end']*1000)>end]
            end=round(gap[-1]['end']*1000) if gap else min(upper-1,end+800);method='bounded-speech-edge'
        start=max(0,start-120);end=min(duration_ms-40,end+180)
        if result and start<result[-1]['endMs']:result[-1]['endMs']=start-1
        if end<=start or result and start<=result[-1]['startMs']:raise ValueError('Invalid Read speech bounds')
        result.append(dict(startMs=start,endMs=end,text=r['text']))
        checks.append(dict(index=i+1,method=method,coverage=round(r['coverage'],4),confidence=round(r['confidence'],4),speechStartMs=r['speechStartMs'],speechEndMs=r['speechEndMs']))
    return result,dict(coverage=round(coverage,4),strongCues=sum(strong(r) for r in rows),totalCues=len(rows),offsetMs=0,offsetConsensus=0,cueChecks=checks,canonicalTextSource='verified-public-Read')
