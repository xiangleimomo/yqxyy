#!/usr/bin/env python3
"""Build episode-local WebVTT, evidenced vocabulary and edited plot quizzes.

Inputs: supplied SRT, chapter boundaries, generated HLS actual offsets and
the original course's bilingual vocabulary glossary. Never synthesizes
dialogue, and never reuses the old 24-episode quiz numbering.
"""
import collections
import html
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[1]
BASE = ROOT / "data/movie-harry-potter-1"
CHAPTERS = ROOT / "data/movie-hp1-independent/course.json"

# All plot questions are original editorial questions for the specified scene.
# Each tuple: question, correct response, alternative A, alternative B, explanation.
STORY = [
 [
  ("Who brings baby Harry to Privet Drive?", "Hagrid", "Professor Snape", "Ron Weasley", "海格把婴儿哈利送到德思礼家。"),
  ("Who decides that Harry should grow up with the Dursleys?", "Dumbledore", "Draco Malfoy", "Professor Quirrell", "邓布利多决定将哈利留给德思礼一家抚养。"),
 ],
 [
  ("Where does Dudley go on his birthday?", "The zoo", "Hogwarts", "Gringotts", "德思礼一家带达力去了动物园。"),
  ("What unexpectedly disappears in the reptile house?", "The glass", "The snake", "The whole building", "爬行动物馆的玻璃突然消失了。"),
 ],
 [
  ("What keeps arriving for Harry?", "Letters", "Broomsticks", "Wands", "不断有寄给哈利的信件出现。"),
  ("What does Uncle Vernon try to prevent?", "Harry reading the letters", "Dudley having a birthday", "Hagrid teaching at school", "弗农姨父千方百计阻止哈利读信。"),
 ],
 [
  ("Who tells Harry that he is a wizard?", "Hagrid", "Vernon", "Ron", "海格向哈利揭示他的巫师身份。"),
  ("Which school has invited Harry to study?", "Hogwarts", "Durmstrang", "A regular primary school", "霍格沃茨向哈利发出了入学邀请。"),
 ],
 [
  ("What kind of place does Harry visit with Hagrid?", "A pub used by witches and wizards", "A Muggle cinema", "A railway station", "破釜酒吧是巫师们出入的场所。"),
  ("Why do people in the pub recognize Harry?", "He is famous in the wizarding world", "He owns the pub", "He is a teacher", "许多巫师认识大难不死的男孩。"),
 ],
 [
  ("Where does Harry collect money left by his parents?", "Gringotts", "The Leaky Cauldron", "The school library", "哈利在古灵阁领取父母留下的财产。"),
  ("What does Hagrid collect from a separate vault?", "A small secret package", "A school broom", "A pet rat", "海格从另一间金库领取了神秘小包裹。"),
 ],
 [
  ("Who helps Harry choose his first wand?", "Ollivander", "Hagrid's dragon", "Filch", "奥利凡德帮助哈利挑选魔杖。"),
  ("According to Ollivander, what chooses the wizard?", "The wand", "The broom", "The Sorting Hat", "奥利凡德解释是魔杖选择巫师。"),
 ],
 [
  ("Who gave Harry his lightning-shaped scar?", "Voldemort", "Ron", "The station guard", "海格解释哈利的伤疤与伏地魔的袭击有关。"),
  ("What travel item does Hagrid hand to Harry?", "A train ticket", "A golden key", "A flying bicycle", "海格给哈利前往学校的火车票。"),
 ],
 [
  ("Which platform must Harry find?", "Platform nine and three-quarters", "Platform six", "Platform one", "哈利的车票写着九又四分之三站台。"),
  ("How does Harry enter the hidden platform?", "By walking through the barrier", "By climbing on the roof", "By taking a taxi", "通往魔法站台的入口在站台间的墙壁。"),
 ],
 [
  ("Who first shares Harry's train compartment?", "Ron Weasley", "Severus Snape", "Vernon Dursley", "罗恩进入哈利所在的火车包厢。"),
  ("Who impresses the boys by using magic and speaking confidently?", "Hermione Granger", "A goblin", "A dragon", "赫敏在火车上展示了自己的魔法知识。"),
 ],
 [
  ("Who guides the first-year students after they arrive?", "Hagrid", "Ollivander", "Uncle Vernon", "海格带领一年级新生前往霍格沃茨。"),
  ("What do the houses compete to win?", "The House Cup", "The Triwizard Cup", "A golden broom", "各学院通过获得积分争夺学院杯。"),
 ],
 [
  ("What does the Sorting Hat decide?", "Which house a student joins", "Who owns the school", "When the train leaves", "分院帽决定新生进入哪个学院。"),
  ("Which house does Harry join?", "Gryffindor", "Slytherin", "Hufflepuff", "哈利被分到了格兰芬多。"),
 ],
 [
  ("Where are the Gryffindor first-years led?", "The common room and dormitories", "Gringotts", "The Forbidden Forest", "新生来到格兰芬多公共休息室和宿舍。"),
  ("What is unusual about the Hogwarts staircases?", "They can change direction", "They are all made of glass", "There are no staircases", "霍格沃茨的楼梯会发生变化。"),
 ],
 [
  ("Who teaches Harry's Potions class?", "Professor Snape", "Madam Hooch", "Ollivander", "斯内普教授负责魔药课。"),
  ("Which place does Harry hear has been broken into?", "Gringotts", "The zoo", "The railway station", "哈利得知古灵阁发生了闯入事件。"),
 ],
 [
  ("Who supervises the first flying lesson?", "Madam Hooch", "Professor Quirrell", "Hagrid's owl", "霍琦夫人教授第一次飞行课。"),
  ("What Quidditch position is Harry invited to play?", "Seeker", "Keeper", "Beater", "哈利出色的飞行天赋使他成为找球手。"),
 ],
 [
  ("What guards the mysterious trapdoor?", "A three-headed dog", "A dragon egg", "A giant chessboard", "三头犬守卫着活板门。"),
  ("Why do the students want to get away from the forbidden corridor?", "A dangerous creature is there", "They must catch a train", "Their classes have ended", "孩子们发现禁区里有危险的三头犬。"),
 ],
 [
  ("What sport is Harry learning to play?", "Quidditch", "Football", "Tennis", "哈利正在学习魁地奇规则。"),
  ("What does Hermione help levitate in Charms class?", "A feather", "A train", "A giant troll", "赫敏成功用漂浮咒使羽毛升起。"),
 ],
 [
  ("Who is found in danger in the girls' bathroom?", "Hermione", "Madam Hooch", "Petunia", "赫敏被困在女盥洗室里。"),
  ("Which creature do the friends face?", "A troll", "A unicorn", "A phoenix", "三人一起面对闯入学校的巨怪。"),
 ],
 [
  ("What does Harry catch to end the Quidditch match?", "The Golden Snitch", "A dragon egg", "A wand", "哈利抓住金色飞贼结束了比赛。"),
  ("Which team wins Harry's first match?", "Gryffindor", "Slytherin", "Neither team", "格兰芬多凭借哈利抓住飞贼获得胜利。"),
 ],
 [
  ("Whom do the children suspect of cursing Harry's broom?", "Snape", "Hagrid", "Ron", "孩子们当时怀疑斯内普对扫帚施咒。"),
  ("Whose name does Hagrid accidentally reveal?", "Nicolas Flamel", "Uncle Vernon", "Madam Hooch", "海格不小心说出了尼可·勒梅的名字。"),
 ],
 [
  ("What does Harry receive as a Christmas gift?", "An invisibility cloak", "A new pet dragon", "A school uniform", "哈利在圣诞节得到一件隐形衣。"),
  ("What does Harry use to explore Hogwarts at night?", "His invisibility cloak", "A flying car", "A telephone", "哈利披着隐形衣夜间探索城堡。"),
 ],
 [
  ("Whom does Harry see in the Mirror of Erised?", "His family", "Vernon and Dudley only", "His Quidditch opponents", "哈利在厄里斯魔镜里看见了自己的家人。"),
  ("According to Dumbledore, what does the mirror show?", "The deepest desires of the heart", "Only the future", "A list of school rules", "邓布利多解释魔镜照出人心最深的渴望。"),
 ],
 [
  ("What special object is associated with Nicolas Flamel?", "The Philosopher's Stone", "The Golden Snitch", "The Sorting Hat", "尼可·勒梅与魔法石有密切关系。"),
  ("What do the friends think the three-headed dog is protecting?", "The Stone", "A school uniform", "The Hogwarts Express", "三人推断三头犬保护着魔法石。"),
 ],
 [
  ("What creature hatches from Hagrid's egg?", "A dragon", "An owl", "A unicorn", "海格孵出了小龙。"),
  ("What name does Hagrid give the baby dragon?", "Norbert", "Fluffy", "Trevor", "海格给小龙取名诺伯。"),
 ],
 [
  ("Where do the students serve their detention?", "The Forbidden Forest", "Gringotts", "Diagon Alley", "学生们被派往禁林劳动服务。"),
  ("What wounded creature is found in the forest?", "A unicorn", "A three-headed dog", "A dragon", "禁林里出现了受伤的独角兽。"),
 ],
 [
  ("Who is called away from Hogwarts?", "Dumbledore", "Ron", "Ollivander", "邓布利多被叫离了霍格沃茨。"),
  ("What do the three friends decide to go through?", "The trapdoor", "The zoo entrance", "The station barrier", "三人决定从活板门下去保护魔法石。"),
 ],
 [
  ("Which plant traps the children after the trapdoor?", "Devil's Snare", "A rose bush", "A Christmas tree", "魔鬼网缠住了落下的孩子们。"),
  ("Who knows how to deal with the dangerous plant?", "Hermione", "Dudley", "Uncle Vernon", "赫敏运用草药课知识脱困。"),
 ],
 [
  ("What must Harry catch in the flying-key chamber?", "The correct flying key", "The Golden Snitch", "A dragon", "哈利必须找到并抓住正确的飞行钥匙。"),
  ("How does Harry reach the flying keys?", "On a broomstick", "On a motorbike", "By climbing a ladder", "哈利骑扫帚追逐飞行的钥匙。"),
 ],
 [
  ("What giant game blocks the way forward?", "Wizard's chess", "Quidditch", "A card game", "三人遇到真人巫师棋棋盘。"),
  ("Who sacrifices his position so Harry can continue?", "Ron", "Draco", "Hagrid", "罗恩甘愿牺牲自己的棋子让哈利继续前进。"),
 ],
 [
  ("Who turns out to be the person seeking the Stone?", "Professor Quirrell", "Professor McGonagall", "Hagrid", "真正企图夺取魔法石的是奇洛教授。"),
  ("Whom had Harry wrongly suspected?", "Professor Snape", "Hermione", "Ron", "哈利此前误以为幕后黑手是斯内普。"),
 ],
 [
  ("What appears in Harry's pocket after he looks in the mirror?", "The Stone", "A school key", "A chocolate frog", "魔法石出现在哈利的口袋里。"),
  ("Who appears on the back of Quirrell's head?", "Voldemort", "Dumbledore", "Hagrid", "伏地魔借助奇洛的身体现身。"),
 ],
 [
  ("Who explains what happened to Harry in the hospital wing?", "Dumbledore", "Draco Malfoy", "Uncle Vernon", "邓布利多在医务室与哈利谈论之前的事件。"),
  ("Whose love protected Harry from Voldemort?", "His mother's", "Malfoy's", "Snape's father's", "哈利母亲留下的爱成为保护他的力量。"),
 ],
 [
  ("Which house wins the House Cup after the final points?", "Gryffindor", "Slytherin", "Ravenclaw", "格兰芬多最后赢得学院杯。"),
  ("Who announces the extra points?", "Dumbledore", "Hagrid", "Ollivander", "邓布利多宣布追加的学院分数。"),
 ],
 [
  ("What does Harry board at the end of the school year?", "The train home", "A ship to Diagon Alley", "A flying car", "学年结束，哈利乘火车离开霍格沃茨。"),
  ("How does Harry feel about leaving Hogwarts?", "Hogwarts still feels like home", "He never wants to return", "He has forgotten his friends", "虽然要离开学校，哈利仍觉得霍格沃茨是自己的家。"),
 ],
]

# Supplemental hand-reviewed vocabulary: only used if that exact word occurs
# in the corresponding uploaded English subtitles.
SUPPLEMENTAL = {
 "wizard":("巫师","noun","A person who can use magic."),
 "witch":("女巫","noun","A woman who can use magic."),
 "magic":("魔法","noun","A mysterious power used by witches and wizards."),
 "spell":("咒语","noun","Words used to produce a magical effect."),
 "letter":("信","noun","A written message sent to someone."),
 "birthday":("生日","noun","The date on which someone was born."),
 "snake":("蛇","noun","A long reptile without legs."),
 "glass":("玻璃","noun","A transparent material used in windows."),
 "cousin":("表兄弟姐妹","noun","A child of one's aunt or uncle."),
 "zoo":("动物园","noun","A place where animals are kept for visitors to see."),
 "train":("火车","noun","A set of connected railway carriages."),
 "station":("车站","noun","A place where trains stop."),
 "platform":("站台","noun","The place where people board a train."),
 "ticket":("车票","noun","A pass allowing travel or admission."),
 "castle":("城堡","noun","A large fortified building."),
 "school":("学校","noun","A place where students learn."),
 "professor":("教授","noun","A teacher at a university or specialist school."),
 "teacher":("教师","noun","A person who teaches students."),
 "student":("学生","noun","A person who is studying."),
 "lesson":("课程","noun","A period of learning or teaching."),
 "learn":("学习","verb","To gain knowledge or a skill."),
 "book":("书","noun","Written pages bound together."),
 "library":("图书馆","noun","A place where books can be read or borrowed."),
 "friend":("朋友","noun","A person you like and trust."),
 "family":("家人","noun","People related by birth or marriage."),
 "father":("父亲","noun","A male parent."),
 "mother":("母亲","noun","A female parent."),
 "parents":("父母","plural noun","A person's mother and father."),
 "trust":("信任","verb","To believe another person is reliable."),
 "brave":("勇敢的","adjective","Ready to face danger."),
 "bravery":("勇气","noun","The quality of being brave."),
 "courage":("勇气","noun","The ability to face fear."),
 "afraid":("害怕的","adjective","Feeling fear."),
 "safe":("安全的","adjective","Protected from danger."),
 "danger":("危险","noun","The possibility of injury or harm."),
 "dangerous":("危险的","adjective","Likely to cause harm."),
 "secret":("秘密","noun","Something kept hidden from others."),
 "famous":("著名的","adjective","Known by many people."),
 "scar":("伤疤","noun","A mark left on skin after an injury."),
 "blood":("血","noun","The red liquid circulating in the body."),
 "wand":("魔杖","noun","A stick used to cast spells."),
 "broom":("扫帚","noun","A brush on a long handle used for sweeping."),
 "broomstick":("飞天扫帚","noun","A broom that witches and wizards can ride."),
 "flying":("飞行的","adjective","Moving through the air."),
 "fly":("飞","verb","To move through the air."),
 "catch":("抓住","verb","To take hold of something moving."),
 "game":("比赛","noun","An activity played according to rules."),
 "match":("比赛","noun","A competition between teams or individuals."),
 "team":("队伍","noun","A group of players working together."),
 "player":("运动员","noun","A person who plays a game."),
 "keeper":("守门员","noun","A player who defends a goal."),
 "seeker":("找球手","noun","A Quidditch player who pursues the Snitch."),
 "snitch":("金色飞贼","noun","A small winged ball used in Quidditch."),
 "quidditch":("魁地奇","noun","A magical sport played on flying broomsticks."),
 "point":("分数","noun","A unit used for scoring."),
 "points":("积分","plural noun","Units used to score in a game."),
 "cup":("奖杯","noun","A trophy awarded to a winner."),
 "win":("获胜","verb","To be the winner."),
 "lose":("失去；输掉","verb","To fail to win or to misplace something."),
 "hat":("帽子","noun","A covering worn on the head."),
 "sorting":("分院","noun","The process of placing someone into a group."),
 "house":("学院；房屋","noun","A school group or a building where people live."),
 "room":("房间","noun","A space inside a building."),
 "dormitory":("宿舍","noun","A room or building where students sleep."),
 "staircase":("楼梯","noun","A flight of steps connecting floors."),
 "door":("门","noun","An entrance that can be opened and closed."),
 "trapdoor":("活板门","noun","A small door set into a floor."),
 "key":("钥匙","noun","An object used to open a lock."),
 "keys":("钥匙","plural noun","Objects used to open locks."),
 "vault":("金库","noun","A secure room used for storing valuables."),
 "bank":("银行","noun","A business that keeps and manages money."),
 "money":("钱","noun","Coins and notes used to buy things."),
 "gold":("金子","noun","A valuable yellow metal."),
 "stone":("石头","noun","A hard piece of rock."),
 "mirror":("镜子","noun","A surface that reflects images."),
 "desire":("渴望","noun","A strong wish to have or do something."),
 "dream":("梦想","noun","A hope or mental experience during sleep."),
 "dreams":("梦想","plural noun","Things one hopes for or imagines while asleep."),
 "cloak":("斗篷","noun","A loose outer garment."),
 "invisibility":("隐形","noun","The state of not being visible."),
 "invisible":("看不见的","adjective","Unable to be seen."),
 "Christmas":("圣诞节","noun","A winter holiday celebrated on December 25."),
 "present":("礼物","noun","A gift given to someone."),
 "presents":("礼物","plural noun","Gifts given to someone."),
 "dragon":("龙","noun","A large legendary reptile."),
 "egg":("蛋","noun","A shell-covered object from which young animals hatch."),
 "forest":("森林","noun","A large area covered with trees."),
 "forbidden":("禁止进入的","adjective","Not permitted."),
 "unicorn":("独角兽","noun","A mythical horse-like animal with one horn."),
 "creature":("生物","noun","A living being, especially an animal."),
 "troll":("巨怪","noun","A large creature from folk stories."),
 "dog":("狗","noun","A domesticated animal."),
 "three-headed":("三头的","adjective","Having three heads."),
 "fluffy":("毛茸茸的","adjective","Soft and covered in fur."),
 "plant":("植物","noun","A living thing that grows from the soil."),
 "snare":("陷阱","noun","A device or situation used to trap."),
 "devil":("魔鬼","noun","An evil spirit in stories."),
 "light":("光","noun","Energy that makes things visible."),
 "fire":("火","noun","A flame that gives heat and light."),
 "chess":("国际象棋","noun","A strategy game played on a checked board."),
 "chessboard":("棋盘","noun","A board with alternating squares."),
 "knight":("骑士","noun","A mounted soldier or a chess piece."),
 "queen":("王后","noun","A powerful chess piece or a female monarch."),
 "sacrifice":("牺牲","noun","Giving up something to help achieve a goal."),
 "protect":("保护","verb","To keep someone safe."),
 "protection":("保护","noun","The action of keeping someone safe."),
 "love":("爱","noun","A deep feeling of care for someone."),
 "truth":("真相","noun","What is real or correct."),
 "curse":("诅咒","noun","Magic intended to cause harm."),
 "cursed":("被诅咒的","adjective","Affected by a harmful spell."),
 "suspect":("怀疑","verb","To think someone may be responsible."),
 "suspicious":("可疑的","adjective","Making one think something is wrong."),
 "mysterious":("神秘的","adjective","Difficult to explain or understand."),
 "strange":("奇怪的","adjective","Unusual or surprising."),
 "unusual":("不寻常的","adjective","Not common or ordinary."),
 "power":("力量","noun","The ability to act or produce an effect."),
 "strong":("强大的","adjective","Having great strength."),
 "weak":("虚弱的","adjective","Not having much strength."),
 "guard":("守卫","verb","To keep watch over something."),
 "escape":("逃脱","verb","To get away from danger."),
 "punishment":("惩罚","noun","A penalty for breaking rules."),
 "detention":("留堂；劳动惩罚","noun","A school punishment keeping a student after lessons."),
 "rule":("规则","noun","An instruction about what is allowed."),
 "rules":("规则","plural noun","Instructions about what is allowed."),
 "follow":("跟随","verb","To go after someone."),
 "followed":("跟随了","verb","Went after someone."),
 "disappear":("消失","verb","To stop being visible."),
 "disappeared":("消失了","verb","Became invisible or went away."),
 "arrive":("到达","verb","To reach a place."),
 "arriving":("正在到达","verb","Coming to a place."),
 "message":("消息","noun","Information passed from someone to another."),
 "mail":("邮件","noun","Letters and parcels sent through the post."),
 "wizardry":("巫术","noun","The practice of magic."),
 "spellbook":("魔法书","noun","A book containing spells."),
 "potion":("魔药","noun","A liquid with magical effects."),
 "potions":("魔药课；魔药","plural noun","Magical liquids or the school subject about them."),
 "charm":("魔咒","noun","A spell that changes how something behaves."),
 "charms":("魔咒课","plural noun","Spells or the Hogwarts school subject about them."),
 "feather":("羽毛","noun","One of the soft parts covering a bird."),
 "levitate":("漂浮","verb","To rise or float in the air."),
 "lift":("举起","verb","To raise something upward."),
 "hospital":("医院","noun","A place where ill or hurt people get care."),
 "nurse":("护士","noun","A person trained to care for patients."),
 "help":("帮助","verb","To assist someone."),
 "helped":("帮助了","verb","Gave help to someone."),
 "remember":("记得","verb","To keep something in memory."),
 "forget":("忘记","verb","To stop remembering something."),
 "believe":("相信","verb","To accept something as true."),
 "promise":("承诺","noun","A declaration that one will do something."),
 "favourite":("最喜欢的","adjective","Liked more than others."),
 "important":("重要的","adjective","Having great value or significance."),
 "great":("伟大的","adjective","Very good or impressive."),
 "wonderful":("精彩的","adjective","Extremely good or enjoyable."),
 "careful":("小心的","adjective","Taking care to avoid problems."),
}

STOP = set("""a an the and or of with in on at by to for from is are was were be been being do does did
i you we they he she it me him her them my your his their our its this that these those
there here what where when why who how which if but so as then not no yes can could
would should will have has had just very much more than all one two three
some something anything nothing everybody everyone someone somebody their there's we're
i'm he's she's it's you're don't didn't won't can't isn't aren't I've they'll""".split())


def cues_from_srt(path):
    raw = path.read_text(encoding="utf-8-sig")
    result = []
    for block in re.split(r"\n\s*\n", raw.replace("\r\n", "\n")):
        lines = block.strip().splitlines()
        time_index = next((i for i, x in enumerate(lines) if "-->" in x), None)
        if time_index is None:
            continue
        match = re.match(r"^\s*(\d\d:\d\d:\d\d[,.]\d+)\s*-->\s*(\d\d:\d\d:\d\d[,.]\d+)", lines[time_index])
        if not match:
            continue
        def seconds(s):
            h, m, rest = s.replace(",", ".").split(":")
            return 3600 * int(h) + 60 * int(m) + float(rest)
        start, end = seconds(match.group(1)), seconds(match.group(2))
        words = [html.unescape(re.sub(r"<[^>]*>", "", t)).strip() for t in lines[time_index + 1:]]
        words = [t for t in words if t]
        if not words or "downloaded from" in " ".join(words).lower():
            continue
        result.append((start, end, words))
    if len(result) < 1000:
        raise ValueError("Input subtitle SRT seems incomplete")
    return result


def vtt_time(t):
    ms = max(0, round(t * 1000))
    return f"{ms//3600000:02d}:{(ms//60000)%60:02d}:{(ms//1000)%60:02d}.{ms%1000:03d}"


def glossary():
    stored = json.loads((BASE / "vocabulary.json").read_text(encoding="utf-8"))
    pool = {}
    for row in stored.values():
        for obj in row:
            key = obj["word"].lower()
            if key not in pool and obj.get("meaningZh") and obj.get("definitionEn"):
                pool[key] = obj
    for word, (zh, pos, definition) in SUPPLEMENTAL.items():
        key = word.lower()
        if key not in pool:
            pool[key] = {
                "word": word, "partOfSpeech": pos, "meaningZh": zh,
                "definitionEn": definition,
            }
    return pool


def build():
    chapters = json.loads(CHAPTERS.read_text(encoding="utf-8"))["chapters"]
    actual = json.loads((BASE / "hls-cuts.json").read_text(encoding="utf-8"))
    assert len(chapters) == len(actual) == len(STORY) == 34
    captions = cues_from_srt(BASE / "reference.en.srt")
    words_pool = glossary()
    episodes = json.loads((BASE / "episodes.json").read_text(encoding="utf-8"))
    subtitles_dir = BASE / "subtitles"
    subtitles_dir.mkdir(parents=True, exist_ok=True)
    vocabulary = {}
    quizzes = {}
    report = []
    for i, (chapter, cut) in enumerate(zip(chapters, actual)):
        eid = i + 1
        assert int(chapter["episodeId"]) == eid == int(cut["episodeId"])
        desired_start, desired_end = float(chapter["start"]), float(chapter["end"])
        video_start, video_end = float(cut["actualStart"]), float(cut["actualEnd"])
        selected = [(s, e, lines) for s, e, lines in captions if e > desired_start and s < desired_end]
        vtt = ["WEBVTT", ""]
        text_lines = []
        for s, e, lines in selected:
            lo = max(0.0, max(desired_start, s) - video_start)
            hi = max(lo + 0.04, min(desired_end, e) - video_start)
            if lo >= (video_end - video_start):
                continue
            vtt.extend([f"{vtt_time(lo)} --> {vtt_time(hi)}", *lines, ""])
            text_lines.append((s, " ".join(lines)))
        (subtitles_dir / f"{eid:03d}.vtt").write_text("\n".join(vtt) + "\n", encoding="utf-8")
        transcript = " ".join(line for _, line in text_lines)
        tokens = collections.Counter(x.lower() for x in re.findall(r"[A-Za-z]+(?:'[a-z]+)?", transcript))
        candidates = []
        for word, meta in words_pool.items():
            if word in STOP or not re.search(rf"\b{re.escape(word)}\b", transcript, flags=re.I):
                continue
            appearance = next((item for item in text_lines if re.search(rf"\b{re.escape(word)}\b", item[1], flags=re.I)), None)
            if not appearance:
                continue
            # Favor lower-frequency plot-specific vocabulary over repetitions of
            # everyday words; avoid inventing terms absent from this episode.
            freq = tokens.get(word, 1)
            specificity = (4 if word in SUPPLEMENTAL else 5) + (1 if len(word) >= 5 else 0)
            candidates.append((specificity + min(freq, 3) / 8, word, meta, appearance))
        candidates.sort(key=lambda x: (-x[0], x[3][0], x[1]))
        chosen = candidates[:6]
        if len(chosen) < 3:
            raise ValueError(f"Episode {eid} has only {len(chosen)} evidenced vocabulary entries")
        vocab = []
        for j, (_, word, meta, (start, spoken)) in enumerate(chosen, 1):
            vocab.append({
                "id": f"hp1-{eid}-{j}",
                "word": meta["word"],
                "partOfSpeech": meta.get("partOfSpeech", "word"),
                "meaningZh": meta["meaningZh"],
                "definitionEn": meta["definitionEn"],
                "example": meta.get("example") or spoken[:180],
                "exampleZh": meta.get("exampleZh") or "",
                "subtitleExample": spoken[:200],
                "source": "Word verified in the user-provided English subtitle",
                "evidence": {"originalStart": round(start, 3), "localStart": round(max(0, start - video_start), 3)},
            })
        vocabulary[str(eid)] = vocab
        qs = []
        for j, (question, correct, wrong1, wrong2, explanation) in enumerate(STORY[i], 1):
            options = [correct, wrong1, wrong2]
            rotation = (eid + j) % 3
            rotated = options[rotation:] + options[:rotation]
            answer = "ABC"[rotated.index(correct)]
            qs.append({
                "id": f"q{j}", "type": "single-choice", "category": "comprehension",
                "question": question,
                "options": [{"key": "ABC"[k], "text": value} for k, value in enumerate(rotated)],
                "answer": answer, "explanation": explanation,
                "source": "Original editorial question based on chapter narrative",
            })
        for j, word in enumerate(vocab[:3], 3):
            distractors = []
            for alt in vocab[3:] + vocab[:3]:
                if alt["word"] != word["word"] and alt["meaningZh"] != word["meaningZh"] and alt["meaningZh"] not in distractors:
                    distractors.append(alt["meaningZh"])
            if len(distractors) < 2:
                for alt in ["历史", "图画", "颜色", "天气"]:
                    if alt not in distractors and alt != word["meaningZh"]:
                        distractors.append(alt)
            options = [word["meaningZh"], distractors[0], distractors[1]]
            rotation = (eid + j) % 3
            rotated = options[rotation:] + options[:rotation]
            qs.append({
                "id": f"q{j}", "type": "single-choice", "category": "vocabulary",
                "question": f'In this episode, what does "{word["word"]}" mean?',
                "options": [{"key": "ABC"[k], "text": value} for k, value in enumerate(rotated)],
                "answer": "ABC"[rotated.index(word["meaningZh"])],
                "explanation": f'{word["word"]}：{word["meaningZh"]}。{word["definitionEn"]}',
                "source": "English subtitle evidence and bilingual vocabulary",
            })
        quizzes[str(eid)] = {"episodeId": eid, "title": f'{chapter["titleZh"]} · Quiz', "questions": qs}
        episodes[i]["modules"] = {
            "watch": True, "read": False, "words": True, "vocabulary": True, "quiz": True,
        }
        episodes[i]["video"]["subtitleUrl"] = f"data/movie-harry-potter-1/subtitles/{eid:03d}.vtt"
        report.append({"episodeId":eid, "subtitleCues":len(text_lines), "words":len(vocab), "questions":len(qs)})
    (BASE / "vocabulary.json").write_text(json.dumps(vocabulary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (BASE / "quiz.json").write_text(json.dumps(quizzes, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (BASE / "episodes.json").write_text(json.dumps(episodes, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (BASE / "course-build-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("Generated VTT, Words, Quiz:", json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    build()
