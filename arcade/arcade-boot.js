const classicPlay=play;
play=function(id){if(!Arcade.modules[id]){classicPlay(id);return}beginRound(id);Arcade.modules[id]()};
Object.keys(Arcade.modules).forEach(id=>{let g=games.find(g=>g[0]===id);if(g)g[4]='ready'});
const readyHall=hall;
hall=function(){readyHall();document.querySelector('.badge').textContent='27 款游戏 · 本地试玩版';document.querySelector('.hero .muted').textContent='选择经典玩法，开始你的词汇挑战。支持手机与电脑，可替换词库，成绩保存在本机。'};
hall();
