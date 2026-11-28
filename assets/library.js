(function(){
  'use strict';
  var cards=Array.prototype.slice.call(document.querySelectorAll('.game-card'));
  var query=document.getElementById('game-search');
  var clear=document.getElementById('clear-search');
  var grid=document.getElementById('game-grid');
  var empty=document.getElementById('empty-state');
  var count=document.getElementById('result-count');
  var status=document.getElementById('search-status');
  var emptyTitle=document.getElementById('empty-title');
  var emptyText=document.getElementById('empty-text');
  var sort=document.getElementById('game-sort');
  var activeView=document.getElementById('active-view');
  var viewLabel=document.getElementById('view-label');
  var currentCategory='all';
  var currentPlatform='all';
  var view='all';
  var categories={all:'全部游戏',survival:'生存挑战',adventure:'冒险闯关',racing:'竞速对战',story:'剧情模拟',life:'休闲生活'};
  var storage={favorites:'xiaoyu-arcade-favorites-v1',recent:'xiaoyu-arcade-recent-v1'};
  var favorites=read(storage.favorites,[]).filter(validId);
  var recent=read(storage.recent,[]).filter(validId);
  var toast=document.getElementById('toast');
  var toastTimer;
  function read(key,fallback){try{var value=JSON.parse(localStorage.getItem(key));return Array.isArray(value)?value:fallback;}catch(e){return fallback;}}
  function save(key,value){try{localStorage.setItem(key,JSON.stringify(value));}catch(e){notify('浏览器存储不可用，当前操作未保存。');}}
  function validId(id){return cards.some(function(card){return card.dataset.id===id;});}
  function notify(message){toast.textContent=message;toast.hidden=false;toast.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(function(){toast.classList.remove('visible');setTimeout(function(){toast.hidden=true;},220);},2000);}
  function setPressed(selector,key,value){document.querySelectorAll(selector).forEach(function(button){var selected=button.dataset[key]===value;button.classList.toggle('active',selected);button.setAttribute('aria-pressed',selected?'true':'false');});}
  function syncFavorites(){document.querySelectorAll('[data-favorite]').forEach(function(button){var on=favorites.indexOf(button.dataset.favorite)>=0;button.setAttribute('aria-pressed',on?'true':'false');var card=button.closest('.game-card');if(card)card.classList.toggle('is-favorite',on);});document.getElementById('favorite-count').textContent=String(favorites.length);}
  function normalizeSearch(value){return String(value).normalize('NFKC').toLocaleLowerCase().replace(/[\s.,，。!！?？·:：;；\-—_'"“”‘’()[\]{}]/g,'');}
  function matches(card){
    var needle=normalizeSearch(query.value.trim());
    var search=normalizeSearch(card.dataset.search);
    if(needle&&search.indexOf(needle)<0)return false;
    if(currentCategory!=='all'&&card.dataset.category!==currentCategory)return false;
    if(currentPlatform!=='all'&&card.dataset.platform!==currentPlatform)return false;
    if(view==='favorites'&&favorites.indexOf(card.dataset.id)<0)return false;
    if(view==='recent'&&recent.indexOf(card.dataset.id)<0)return false;
    return true;
  }
  function render(){
    var shown=[];
    cards.forEach(function(card){var visible=matches(card);card.hidden=!visible;if(visible)shown.push(card);});
    var mode=sort.value;
    shown.sort(function(a,b){if(mode==='name')return a.dataset.title.localeCompare(b.dataset.title,'zh-CN');if(mode==='recent'){var ai=recent.indexOf(a.dataset.id),bi=recent.indexOf(b.dataset.id);return (ai<0?999:ai)-(bi<0?999:bi);}return Number(a.dataset.order)-Number(b.dataset.order);});
    shown.forEach(function(card){grid.appendChild(card);});
    count.textContent=String(shown.length);
    empty.hidden=shown.length!==0;
    clear.hidden=query.value.length===0;
    if(view==='favorites'&&favorites.length===0){emptyTitle.textContent='先收藏几款游戏';emptyText.textContent='点击游戏封面上的心形按钮，喜爱的作品会保存在此浏览器。';}
    else if(view==='recent'&&recent.length===0){emptyTitle.textContent='最近还没有浏览记录';emptyText.textContent='打开一款游戏后，它会出现在这里。';}
    else{emptyTitle.textContent=query.value?'没有找到匹配的游戏':'这个筛选下暂时没有游戏';emptyText.textContent='试试其他关键词，或换一个分类看看。';}
    status.textContent='显示 '+shown.length+' 款游戏'+(currentCategory!=='all'?' · '+categories[currentCategory]:'')+(currentPlatform==='download'?' · UOS ARM64 下载':currentPlatform==='web'?' · 网页即玩':'');
    var special=view!=='all'||currentCategory!=='all'||currentPlatform!=='all'||!!query.value.trim();
    activeView.hidden=!special;
    if(special){var label=view==='favorites'?'我的收藏':view==='recent'?'最近浏览':'全部游戏';if(currentCategory!=='all')label+=' / '+categories[currentCategory];if(currentPlatform==='download')label+=' / UOS 下载';if(currentPlatform==='web')label+=' / 网页即玩';if(query.value.trim())label+=' / “'+query.value.trim()+'”';viewLabel.textContent=label;}
  }
  function applyCategory(category,updateUrl){if(!Object.prototype.hasOwnProperty.call(categories,category))category='all';currentCategory=category;setPressed('.category-chip[data-category]','category',category);setPressed('.side-category[data-category]','category',category);render();if(updateUrl!==false)writeUrl();}
  function applyPlatform(platform,updateUrl){if(['all','web','download'].indexOf(platform)<0)platform='all';currentPlatform=platform;setPressed('.platform-filters [data-platform]','platform',platform);render();if(updateUrl!==false)writeUrl();}
  function applyView(next,updateUrl){view=['all','favorites','recent'].indexOf(next)>=0?next:'all';document.querySelectorAll('.side-link[data-view]').forEach(function(button){var on=button.dataset.view===view;button.classList.toggle('active',on);button.setAttribute('aria-pressed',on?'true':'false');});document.querySelectorAll('.header-nav [data-view]').forEach(function(button){button.classList.toggle('active',button.dataset.view===view);});document.querySelector('[data-nav="discover"]').classList.toggle('active',view==='all');render();if(updateUrl!==false)writeUrl();}
  function writeUrl(){try{var url=new URL(location.href);['category','platform','view','q'].forEach(function(key){url.searchParams.delete(key);});if(currentCategory!=='all')url.searchParams.set('category',currentCategory);if(currentPlatform!=='all')url.searchParams.set('platform',currentPlatform);if(view!=='all')url.searchParams.set('view',view);if(query.value.trim())url.searchParams.set('q',query.value.trim());history.replaceState({arcadeFilters:true},'',url);}catch(e){}}
  function clearFilters(){query.value='';sort.value='featured';applyView('all',false);applyCategory('all',false);applyPlatform('all',false);render();writeUrl();}
  query.addEventListener('input',function(){render();writeUrl();});
  clear.addEventListener('click',function(){query.value='';query.focus();render();writeUrl();});
  sort.addEventListener('change',render);
  document.querySelectorAll('.category-chip[data-category],.side-category[data-category]').forEach(function(button){button.addEventListener('click',function(){applyView('all',false);applyCategory(button.dataset.category);document.getElementById('library').scrollIntoView({block:'start',behavior:'smooth'});});});
  document.querySelectorAll('.platform-filters [data-platform],.header-nav [data-platform]').forEach(function(button){button.addEventListener('click',function(){if(button.closest('.header-nav')){query.value='';applyView('all',false);applyCategory('all',false);}applyPlatform(button.dataset.platform);if(button.closest('.header-nav'))document.getElementById('library').scrollIntoView({block:'start',behavior:'smooth'});});});
  document.querySelector('[data-nav="discover"]').addEventListener('click',clearFilters);
  document.querySelectorAll('.side-link[data-view],.header-nav [data-view]').forEach(function(button){button.addEventListener('click',function(){applyView(button.dataset.view);document.getElementById('library').scrollIntoView({block:'start',behavior:'smooth'});});});
  document.querySelectorAll('[data-favorite]').forEach(function(button){button.addEventListener('click',function(){var id=button.dataset.favorite,index=favorites.indexOf(id);if(index<0){favorites.push(id);notify('已加入我的收藏');}else{favorites.splice(index,1);notify('已从收藏中移除');}save(storage.favorites,favorites);syncFavorites();render();});});
  document.querySelectorAll('[data-visit]').forEach(function(link){link.addEventListener('click',function(event){if(event.defaultPrevented)return;var id=link.dataset.visit;recent=[id].concat(recent.filter(function(item){return item!==id;})).slice(0,12);save(storage.recent,recent);});});
  function chooseRandom(){var eligible=cards.filter(function(card){return card.dataset.platform==='web'&&matches(card);});if(!eligible.length){notify('当前筛选里没有网页游戏，试试清除筛选。');return;}var selected=eligible[Math.floor(Math.random()*eligible.length)];selected.querySelector('.card-main').click();}
  document.getElementById('random-game').addEventListener('click',chooseRandom);
  document.getElementById('reset-filters').addEventListener('click',clearFilters);
  document.getElementById('empty-reset').addEventListener('click',clearFilters);
  document.getElementById('focus-search').addEventListener('click',function(){document.getElementById('library').scrollIntoView({block:'start',behavior:'smooth'});query.focus({preventScroll:true});});
  document.getElementById('show-credits').addEventListener('click',function(){var credits=document.getElementById('credits');credits.open=!credits.open;if(credits.open)credits.scrollIntoView({block:'nearest',behavior:'smooth'});});
  document.addEventListener('keydown',function(event){if(event.defaultPrevented||event.metaKey||event.ctrlKey||event.altKey)return;var target=event.target;if(target&&(/INPUT|TEXTAREA|SELECT/.test(target.tagName)||target.isContentEditable))return;if(event.key==='/'&&document.getElementById('gate').hidden){event.preventDefault();document.getElementById('library').scrollIntoView({block:'start',behavior:'smooth'});query.focus({preventScroll:true});}});
  window.addEventListener('popstate',function(){var params=new URLSearchParams(location.search);query.value=(params.get('q')||'').slice(0,100);sort.value='featured';applyView(params.get('view')||'all',false);applyCategory(params.get('category')||'all',false);applyPlatform(params.get('platform')||'all',false);render();});
  document.querySelectorAll('[data-count]').forEach(function(node){node.textContent=String(cards.filter(function(card){return card.dataset.category===node.dataset.count;}).length);});
  syncFavorites();
  var params=new URLSearchParams(location.search);query.value=(params.get('q')||'').slice(0,100);applyView(params.get('view')||'all',false);applyCategory(params.get('category')||'all',false);applyPlatform(params.get('platform')||'all',false);render();
}());
