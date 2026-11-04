
        let authToken='cookie',authSetup=false,appInitialized=false;
        async function authRpc(method,...args){const payload={action:method};if(method==='login')payload.password=args[0];const response=await fetch('/api/rpc',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const result=await response.json();if(!response.ok||!result.ok)throw Error(result.error||'연결하지 못했어요');return result.data;}
        function lockApp(){document.body.classList.add('auth-locked');document.getElementById('authGate').hidden=false;cloudReady=false;clearTimeout(cloudTimer);}
        function unlockApp(){document.body.classList.remove('auth-loading');document.body.classList.remove('auth-locked');document.getElementById('authGate').hidden=true;if(!appInitialized){appInitialized=true;initApp();}else initializeCloud();}
        async function startAuth(){document.body.classList.add('auth-loading');lockApp();try{try{await authRpc('session');unlockApp();return;}catch(e){if(e.message!=='AUTH_REQUIRED')throw e;}const state=await authRpc('status');authSetup=false;document.getElementById('authDescription').textContent=state.configured?'비밀번호를 입력해 주세요.\n같은 기기에서는 로그인이 유지됩니다.':'소유자의 최초 비밀번호 설정이 필요해요.';document.getElementById('authPassword').hidden=!state.configured;document.getElementById('authSubmit').hidden=!state.configured;document.getElementById('authSubmit').textContent='로그인';}catch(e){document.getElementById('authMessage').textContent=e.message||'연결하지 못했어요';}finally{document.body.classList.remove('auth-loading');}}
        async function submitAuth(event){event.preventDefault();const button=document.getElementById('authSubmit'),input=document.getElementById('authPassword');button.disabled=true;document.getElementById('authMessage').textContent='';try{await authRpc('login',input.value);input.value='';unlockApp();}catch(e){document.getElementById('authMessage').textContent=e.message||'로그인하지 못했어요';}finally{button.disabled=false;}}
        async function logoutApp(){if(cloudBusy||cloudPending.size){notify('저장 완료 후 로그아웃해 주세요');return;}try{await authRpc('logout',authToken);authToken='';localStorage.removeItem('karaoke_session');closeLyrics();lockApp();await startAuth();}catch(e){notify('로그아웃하지 못했어요. 다시 시도해 주세요');}}
        window.addEventListener('pageshow',e=>{if(e.persisted)startAuth();});
        window.addEventListener('focus',()=>{if(appInitialized&&!cloudBusy)startAuth();});
        let songs = [];
        let currentFilter = 'ALL';
        let formGenre = 'J-POP';
        let isEditMode = false;
        let selectedIds = new Set();

        function initApp() {
            try { songs = JSON.parse(localStorage.getItem('karaoke_v5_data')) || []; if(!Array.isArray(songs)) songs=[]; } catch(e) { songs=[]; notify('저장된 데이터 확인이 필요해요. 백업 파일을 보관해 주세요.'); }
            renderList();
            initializeCloud();
            
            document.getElementById('lyricsEditor').addEventListener('paste',e=>{const clipboard=e.clipboardData;if(!clipboard)return;const html=clipboard.getData('text/html'),text=clipboard.getData('text/plain');if(!html&&!text)return;e.preventDefault();const cleaned=html?cleanLyricsHtml(html):'',formatted=cleaned&&hasLyricsFormatting(cleaned)?cleaned:formatPlainLyrics(text)||cleaned||'<div style="white-space:pre-wrap">'+escapeText(text)+'</div>';document.execCommand('insertHTML',false,formatted);updateLyricsTools();});
        }

        function normalizeJapaneseLyricLines(text){
            return String(text||'').replace(/\r/g,'\n').replace(/\u00a0/g,' ').split('\n')
                .map(line=>line.replace(/[\u200b-\u200d\ufeff]/g,'')
                    .replace(/\[[^\]\r\n]*\]/g,'')
                    .replace(/^\s*(?:\d{1,3}[.)．、]\s+|[①②③④⑤⑥⑦⑧⑨⑩]\s+)/,'')
                    .replace(/\s*[（(]\s*(?:간주|전주|후주|반주|instrumental|interlude|verse\s*\d*|chorus|bridge|intro|outro)\s*[）)]\s*/gi,'')
                    .replace(/^[ \t\u3000]*(?:[-–—._=~*·•]{2,}|[♪♫♬]+)[ \t\u3000]*$/,'')
                    .replace(/[ \t\u3000]{2,}(?=[（「『(])/g,'')
                    .replace(/(?<=[（「『(])[ \t\u3000]+/g,'')
                    .replace(/[ \t\u3000]+(?=[）」』)])/g,'')
                    .replace(/[ \t\u3000]{2,}/g,' ')
                    .trim())
                .filter(line=>line&&!/^(?:\/\/|#|<!--|-->|\/\*|\*\/|\* |※|주석\s*[:：]|메모\s*[:：]|참고\s*[:：]|출처\s*[:：]|작사\s*[:：]|작곡\s*[:：]|편곡\s*[:：]|번역\s*[:：]|가사\s*[:：]|(?:repeat\s*\d+\s*x|\d+\s*[x×]\s*repeat|[x×]\s*\d+))\s*$/i.test(line))
                .map(line=>line.replace(/\s*(?:\/\/|#)\s*(?:주석|메모|참고)\s*[:：].*$/,'').trim())
                .filter(Boolean);
        }
        function formatPlainLyrics(text){
            const lines=normalizeJapaneseLyricLines(text);
            if(!lines.length)return '';
            const isCjk=line=>/[\u3040-\u30ff\u3400-\u9fff]/.test(line);
            const isHangul=line=>/[가-힣]/.test(line);
            const isLatin=line=>/[A-Za-z\u00c0-\u024f]/.test(line);
            const isEnglish=line=>isLatin(line)&&!isCjk(line)&&!isHangul(line);
            const isOriginal=line=>isCjk(line)||isEnglish(line);
            const isReading=line=>isHangul(line)||isEnglish(line);
            const isMeaning=line=>isHangul(line);
            const n=lines.length,dp=Array(n+1).fill(null);
            dp[n]={score:0,groups:[]};
            for(let i=n-1;i>=0;i--){
                if(!isOriginal(lines[i]))continue;
                const candidates=[];
                if(isEnglish(lines[i]))candidates.push({size:1,score:12});
                if(i+1<n&&isReading(lines[i+1])){
                    if(isCjk(lines[i])||isHangul(lines[i+1])){
                        candidates.push({size:2,score:isCjk(lines[i])?24:20});
                        if(i+2<n&&isMeaning(lines[i+2]))candidates.push({size:3,score:isCjk(lines[i])?35:30});
                    }
                }
                for(const candidate of candidates){
                    const next=dp[i+candidate.size];
                    if(!next)continue;
                    const score=candidate.score+next.score;
                    if(!dp[i]||score>dp[i].score)dp[i]={score,groups:[lines.slice(i,i+candidate.size),...next.groups]};
                }
            }
            if(!dp[0])return '';
            const clean=line=>escapeText(line);
            return dp[0].groups.map(group=>'<div style="margin-bottom:24px;line-height:1.5"><div style="color:#1c1e21;font-weight:700">'+clean(group[0])+'</div>'+(group[1]?'<div style="color:#e54848;font-weight:700">'+clean(group[1])+'</div>':'')+(group[2]?'<div style="color:#9ca3af;font-weight:400">'+clean(group[2])+'</div>':'')+'</div>').join('');
        }
        let autoFormatUndoHtml=null;
        function updateAutoFormatUndoButton(){
            const button=document.getElementById('autoFormatUndoBtn');
            if(button)button.hidden=autoFormatUndoHtml===null;
        }
        function undoAutoFormat(){
            if(autoFormatUndoHtml===null)return;
            const editor=document.getElementById('lyricsEditor');
            editor.innerHTML=autoFormatUndoHtml;
            autoFormatUndoHtml=null;
            updateAutoFormatUndoButton();
            resetAutoFormatStatus();
            lyricsSelection=null;
            updateLyricsTools();
        }
        function resetAutoFormatStatus(){
            const message=document.getElementById('japaneseLyricsFormatMessage');
            if(message){message.hidden=false;message.dataset.state='idle';message.textContent='미적용';}
        }
        document.addEventListener('input',event=>{if(event.target&&event.target.id==='lyricsEditor'){autoFormatUndoHtml=null;updateAutoFormatUndoButton();resetAutoFormatStatus();}});
        function applyJapaneseLyricsFormat(){
            const editor=document.getElementById('lyricsEditor');
            const message=document.getElementById('japaneseLyricsFormatMessage');
            const text=editor.innerText||editor.textContent||'';
            const lines=normalizeJapaneseLyricLines(text);
            const formatted=formatPlainLyrics(text);
            message.hidden=false;
            if(!formatted){
                message.dataset.state='error';
                message.textContent=!lines.length?'가사를 먼저 입력해 주세요.':'원문(영어 단독 가능) → 발음 → (선택) 뜻 순서를 확인해 주세요. 총 '+lines.length+'줄입니다.';
                return;
            }
            autoFormatUndoHtml=editor.innerHTML;
            editor.innerHTML=formatted;
            updateAutoFormatUndoButton();
            message.dataset.state='success';
            message.textContent='적용 완료';
            lyricsSelection=null;
            updateLyricsTools();
        }
        function hasLyricsFormatting(html){const doc=new DOMParser().parseFromString(html,'text/html');return !!doc.querySelector('b,strong,i,em,u,s,font,[style*="color"],[style*="font-weight"],[style*="font-style"],[style*="text-decoration"]');}
        function cleanLyricsHtml(html){const source=new DOMParser().parseFromString(html,'text/html'),output=document.createElement('div');const properties=['color','backgroundColor','fontWeight','fontStyle','textDecoration','textAlign','whiteSpace','letterSpacing','marginBottom','lineHeight'];Array.from(source.querySelectorAll('style')).forEach(style=>{const rules=style.textContent.matchAll(/([^{}]+)\{([^{}]*)\}/g);for(const rule of rules){try{const declaration=document.createElement('span');declaration.style.cssText=rule[2];source.querySelectorAll(rule[1]).forEach(node=>properties.forEach(key=>{if(!node.style[key]&&declaration.style[key])node.style[key]=declaration.style[key];}));}catch(e){}}});const allowed=new Set(['DIV','P','BR','SPAN','B','STRONG','I','EM','U','S','FONT','UL','OL','LI','BLOCKQUOTE','H1','H2','H3','H4','H5','H6','PRE']);const blocked=new Set(['SCRIPT','STYLE','IFRAME','OBJECT','EMBED','SVG','MATH','IMG','VIDEO','AUDIO','LINK','META']);function copy(node,parent){if(node.nodeType===3){parent.appendChild(document.createTextNode(node.textContent));return;}if(node.nodeType!==1||blocked.has(node.tagName))return;let target=parent;if(allowed.has(node.tagName)){target=document.createElement(node.tagName==='FONT'?'span':node.tagName.toLowerCase());properties.forEach(key=>{if(node.style[key])target.style[key]=node.style[key];});if(node.tagName==='FONT'&&node.getAttribute('color'))target.style.color=node.getAttribute('color');parent.appendChild(target);}Array.from(node.childNodes).forEach(child=>copy(child,target));}Array.from(source.body.childNodes).forEach(node=>copy(node,output));return output.innerHTML;}

        function switchTab(tabId, el) {
            const previousTab=document.querySelector('.tab-content.active');
            const nextTab=document.getElementById('tab-' + tabId);
            const order=['home','add','chart','more'];
            const from=order.indexOf(previousTab?.id.replace('tab-',''));
            const to=order.indexOf(tabId);
            const forward=from>=0&&to>=0&&((to-from+order.length)%order.length===1);
            const backward=from>=0&&to>=0&&((from-to+order.length)%order.length===1);
            document.querySelectorAll('.tab-content').forEach(c=>c.classList.remove('active'));
            document.querySelectorAll('.nav-item').forEach(i=>i.classList.remove('active'));
            closeLyrics();
            if(tabId!=='home'&&isEditMode)toggleEditMode();
            nextTab.classList.add('active');
            if(previousTab&&previousTab!==nextTab&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches){
                nextTab.getAnimations().forEach(animation=>animation.cancel());
                const offset=forward?24:backward?-24:0;
                nextTab.animate([{opacity:.55,transform:'translateX('+offset+'px)'},{opacity:1,transform:'translateX(0)'}],{duration:280,easing:'cubic-bezier(.22,1,.36,1)'});
            }
            el.classList.add('active');
            document.getElementById('bottom-nav').style.setProperty('--nav-active-index',Array.prototype.indexOf.call(el.parentElement.children,el));
            if(tabId==='home')renderList();
            if(tabId==='chart')loadKaraokeChart(false);
            window.scrollTo(0,0);
        }


        let karaokeChartGenre='all';
        const karaokeChartCache=new Map();
        let karaokeChartRequest=0;
        function setKaraokeChart(genre){
            karaokeChartGenre=['all','kpop','jpop'].includes(genre)?genre:'all';
            document.querySelectorAll('[data-chart-genre]').forEach(button=>button.classList.toggle('active',button.dataset.chartGenre===karaokeChartGenre));
            loadKaraokeChart(false);
        }
        function refreshKaraokeChart(){loadKaraokeChart(true);}
        async function loadKaraokeChart(force){
            const genre=karaokeChartGenre,token=++karaokeChartRequest;
            const status=document.getElementById('chartStatus'),list=document.getElementById('chartSongs');
            const cached=karaokeChartCache.get(genre);
            if(cached&&!force&&Date.now()-cached.time<300000){renderKaraokeChart(cached.items,cached.fetchedAt);return;}
            status.textContent='차트를 불러오는 중…';
            list.replaceChildren();
            try{
                const response=await fetch('/api/chart?genre='+genre+(force?'&refresh=1':''),{cache:'no-store'});
                const payload=await response.json();
                if(token!==karaokeChartRequest)return;
                if(!response.ok)throw Error(payload.error||'차트를 가져오지 못했어요.');
                if(!Array.isArray(payload.items)||!payload.items.length)throw Error('현재 순위 데이터가 없어요.');
                karaokeChartCache.set(genre,{items:payload.items,fetchedAt:payload.fetchedAt,time:Date.now()});
                renderKaraokeChart(payload.items,payload.fetchedAt);
            }catch(error){
                if(token!==karaokeChartRequest)return;
                status.textContent='차트를 불러오지 못했어요.';
                const message=document.createElement('p');message.className='chart-error';message.textContent=error.message+' 잠시 후 새로고침하거나 공식 차트를 확인해 주세요.';
                list.append(message);
            }
        }
        function renderKaraokeChart(items,fetchedAt){
            const status=document.getElementById('chartStatus'),list=document.getElementById('chartSongs');
            const time=fetchedAt?new Date(fetchedAt).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}):'';
            status.textContent='TJ 인기 TOP '+items.length+(time?' · 조회 '+time:'');
            list.replaceChildren();
            const fragment=document.createDocumentFragment();
            items.forEach(song=>{
                const row=document.createElement('div');row.className='chart-song';
                const rank=document.createElement('span');rank.className='chart-rank';rank.textContent=song.rank;
                const detail=document.createElement('div');detail.className='chart-song-detail';
                const title=document.createElement('strong');title.textContent=song.title;
                const artist=document.createElement('span');artist.textContent=song.artist;
                detail.append(title,artist);
                const number=document.createElement('span');number.className='chart-song-number';number.textContent='TJ '+song.tj;
                row.append(rank,detail,number);fragment.append(row);
            });
            list.append(fragment);
        }

        let songLookupItems=[];
        async function searchKaraokeSongs(){
            const input=document.getElementById('songLookupQuery');
            const results=document.getElementById('songLookupResults');
            const status=document.getElementById('songLookupStatus');
            const button=document.getElementById('songLookupSearchBtn');
            const q=input.value.trim();
            if(q.length<2){status.textContent='검색어를 2글자 이상 입력해 주세요.';return;}
            const token=(window.songLookupToken||0)+1;window.songLookupToken=token;
            button.disabled=true;status.textContent='TJ · KY 검색 중…';results.hidden=true;results.replaceChildren();songLookupItems=[];
            try{
                const response=await fetch('/api/song-search?q='+encodeURIComponent(q),{credentials:'same-origin'});
                const payload=await response.json();
                if(token!==window.songLookupToken)return;
                if(!response.ok)throw Error(payload.error||'검색 서버에 연결하지 못했어요.');
                songLookupItems=Array.isArray(payload.items)?payload.items:[];
                status.textContent=songLookupItems.length?('검색 결과 '+songLookupItems.length+'개'):(payload.partial?'일부 검색 서비스에 연결하지 못했어요.':'결과가 없어요. 다른 표기로 검색하거나 직접 입력하세요.');
                songLookupItems.forEach((song,index)=>{
                    const item=document.createElement('button');item.type='button';item.className='song-lookup-item';
                    const details=document.createElement('span');details.className='song-lookup-details';
                    const title=document.createElement('strong');title.textContent=song.title;
                    const artist=document.createElement('small');artist.textContent=song.artist;
                    const number=document.createElement('span');number.className='song-lookup-number';number.textContent=[song.tj&&'TJ '+song.tj,song.ky&&'KY '+song.ky].filter(Boolean).join(' · ');
                    details.append(title,artist);item.append(details,number);
                    item.addEventListener('click',()=>selectKaraokeSong(index));
                    results.append(item);
                });
                results.hidden=!songLookupItems.length;
            }catch(error){if(token===window.songLookupToken)status.textContent='검색 오류: '+error.message;}
            finally{if(token===window.songLookupToken)button.disabled=false;}
        }
        function selectKaraokeSong(index){
            const song=songLookupItems[index];if(!song)return;
            const title=document.getElementById('inTitle'),artist=document.getElementById('inArtist');
            title.value=song.title;artist.value=song.artist;
            if(song.tj)document.getElementById('inTJ').value=song.tj;
            if(song.ky)document.getElementById('inKY').value=song.ky;
            document.getElementById('songLookupResults').hidden=true;
            document.getElementById('songLookupStatus').textContent='선택 완료 · 번호를 확인한 후 저장해 주세요.';
        }
        document.addEventListener('keydown',event=>{if(event.key==='Enter'&&event.target?.id==='songLookupQuery'){event.preventDefault();searchKaraokeSongs();}});
        function resetAllStates() {
            document.getElementById('searchInput').value = '';
            currentFilter = 'ALL';
            document.querySelectorAll('.filter-pill').forEach(btn=>btn.classList.toggle('active',btn.id==='pill-ALL'));
            if(isEditMode) toggleEditMode();
            document.getElementById('editingId').value = '';
            document.querySelectorAll('#tab-add input[type="text"]').forEach(i => i.value = '');
            document.getElementById('lyricsEditor').innerHTML = '';
            autoFormatUndoHtml=null;
            updateAutoFormatUndoButton();
            resetAutoFormatStatus();
            document.getElementById('add-page-title').innerText = "곡 추가";
            document.getElementById('saveBtn').innerText = "저장하기";
            document.getElementById('cancelEditBtn').classList.add('hidden');
            setFormGenre('J-POP');
            document.getElementById('songFormMessage').textContent='';
            document.querySelectorAll('#tab-add [aria-invalid]').forEach(el=>el.removeAttribute('aria-invalid'));
            closeLyrics();
        }

        function renderList() {
            const query = document.getElementById('searchInput').value.toLowerCase().trim();
            const container = document.getElementById('mainList');
            const filtered = songs.filter(s => {
                const match = String(s.title||'').toLowerCase().includes(query) || String(s.artist||'').toLowerCase().includes(query) || (s.sub && s.sub.toLowerCase().includes(query));
                if(currentFilter === 'ALL') return match;
                if(currentFilter === 'FAV') return match && s.fav;
                return match && s.genre === currentFilter;
            });
            container.innerHTML = filtered.length ? '' : '<div class="text-center py-20 opacity-20 font-bold italic">결과가 없습니다.</div>';
            updateDeleteBar();
            filtered.forEach(s => {
                const wrapper = document.createElement('div');
                wrapper.dataset.songId = String(s.id);
                wrapper.className = 'song-card-wrapper' + (isEditMode ? ' edit-mode' : '');
                wrapper.innerHTML = `<button type="button" class="swipe-delete" aria-label="곡 삭제" onclick="event.stopPropagation(); deleteSongs([${s.id}])"><i class="fas fa-trash-alt"></i></button><div class="delete-checkbox ${selectedIds.has(s.id)?'checked':''}" onclick="handleCardClick(${s.id})">${selectedIds.has(s.id)?'<i class="fas fa-check"></i>':''}</div><div class="song-card" onclick="handleCardClick(${s.id})"><div class="flex-1 overflow-hidden pr-4"><div class="flex items-center gap-1.5">${s.fav?'<i class="fas fa-heart text-[var(--ios-heart)] text-[10px]"></i>':''}<h4 class="font-bold text-lg truncate">${escapeText(s.title)}</h4></div><p class="text-xs text-gray-400 mt-1 truncate">${escapeText(s.artist)} ${s.sub?'• '+escapeText(s.sub):''}</p></div><div class="shrink-0 text-right"><div><span class="num-label">TJ</span><span class="num-val">${escapeText(s.tj)}</span></div><div><span class="num-label">KY</span><span class="num-val">${escapeText(s.ky)}</span></div></div></div>`;
                container.appendChild(wrapper);
                bindSwipe(wrapper);
            });
        }

        function showLyrics(id) {
            const song = songs.find(s => s.id === id); if(!song) return;
            document.getElementById('popTitle').innerText = song.title;
            document.getElementById('popArtist').innerText = `${song.artist} • ${song.genre}`;
            document.getElementById('popTJ').innerText = song.tj;
            document.getElementById('popKY').innerText = song.ky;
            document.getElementById('popContent').innerHTML = song.lyrics || '가사가 없습니다.';
            const fBtn = document.getElementById('popFavBtn');
            fBtn.style.color = song.fav ? '#FF8787' : '#E5E5EA';
            fBtn.onclick = () => { song.fav = !song.fav; persistSongs(); showLyrics(id); renderList(); };
            document.getElementById('popEditBtn').onclick = () => {
                closeLyrics();
                switchTab('add', document.querySelectorAll('.nav-item')[1]);
                resetAllStates();
                document.getElementById('editingId').value = song.id;
                document.getElementById('inTitle').value = song.title;
                document.getElementById('inSubTitle').value = song.sub || '';
                document.getElementById('inArtist').value = song.artist;
                document.getElementById('inTJ').value = song.tj;
                document.getElementById('inKY').value = song.ky;
                document.getElementById('lyricsEditor').innerHTML = song.lyrics;
                document.getElementById('add-page-title').innerText = "곡 수정";
                document.getElementById('saveBtn').innerText = "수정 완료";
                document.getElementById('cancelEditBtn').classList.remove('hidden');
                setFormGenre(song.genre);
            };
            openLyrics();
        }

        // 아이폰 최적화: 전체 선택 + 복사 + 알림 통합 함수
        async function copyAndSelectAll() {
            const content = document.getElementById('popContent');
            // 1. 전체 선택 시각화
            const range = document.createRange();
            range.selectNodeContents(content);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
            // 2. 복사 실행
            try {
                await navigator.clipboard.writeText(content.innerText);
            } catch (e) {
                document.execCommand('copy'); // 구형 대응
            }
            // 3. 토스트 알림
            const toast = document.getElementById('toast');
            toast.style.opacity = '1';
            setTimeout(() => toast.style.opacity = '0', 2000);
        }

        function saveSong() {
            const title = document.getElementById('inTitle').value.trim();
            const artist = document.getElementById('inArtist').value.trim();
            const message=document.getElementById('songFormMessage');
            ['inTitle','inArtist'].forEach(id=>document.getElementById(id).setAttribute('aria-invalid',String(!document.getElementById(id).value.trim())));
            if(!title || !artist){message.textContent='제목과 가수를 입력해 주세요.';document.getElementById(!title?'inTitle':'inArtist').focus();return;}
            message.textContent='';
            const editId = document.getElementById('editingId').value;
            const existing=editId?songs.find(s=>s.id===Number(editId)):null;
            if(editId&&!existing){message.textContent='이 곡을 찾을 수 없어요. 목록에서 다시 열어 주세요.';return;}
            let newId=Date.now();while(songs.some(s=>s.id===newId))newId++;
            const before=songs.slice();
            const data = {
                id: editId ? Number(editId) : newId,
                genre: formGenre, title, sub: document.getElementById('inSubTitle').value,
                artist, tj: document.getElementById('inTJ').value || '-', ky: document.getElementById('inKY').value || '-',
                lyrics: document.getElementById('lyricsEditor').innerHTML,
                fav: existing ? existing.fav : false
            };
            if(editId) songs[songs.findIndex(s => s.id === data.id)] = data;
            else songs.unshift(data);
            if(persistSongs()===false){songs=before;message.textContent='기기 저장 공간을 확인해 주세요. 입력 내용은 유지됩니다.';return;}
            resetAllStates();
            switchTab('home', document.querySelectorAll('.nav-item')[0]);
        }

        function setFormGenre(g) {
            formGenre = g;
            ['btnJ', 'btnK', 'btnE'].forEach(id => document.getElementById(id).className = 'flex-1 py-3 rounded-xl text-xs font-bold text-gray-400');
            const target = g === 'J-POP' ? 'btnJ' : (g === 'K-POP' ? 'btnK' : 'btnE');
            document.getElementById(target).className = 'flex-1 py-3 rounded-xl text-xs font-bold bg-white shadow-sm';
        }

        function setFilter(f) {
            currentFilter = f;
            document.querySelectorAll('.filter-pill').forEach(btn => btn.classList.toggle('active', btn.id === 'pill-'+f));
            renderList();
        }

        function toggleEditMode() { isEditMode = !isEditMode; selectedIds.clear(); document.getElementById('main-edit-toggle').innerText = isEditMode ? "취소" : "편집"; renderList(); }
        function handleCardClick(id) { if(Date.now()<suppressCardUntil)return; const opened=document.querySelector('.swipe-open');if(opened){opened.classList.remove('swipe-open');return;} if(isEditMode) { if(selectedIds.has(id)) selectedIds.delete(id); else selectedIds.add(id); renderList(); } else showLyrics(id); }
        let lyricsSelection=null;
        document.addEventListener('selectionchange',()=>{const selection=window.getSelection(),editor=document.getElementById('lyricsEditor');if(selection.rangeCount&&editor.contains(selection.anchorNode)&&editor.contains(selection.focusNode)){lyricsSelection=selection.getRangeAt(0).cloneRange();updateLyricsTools();}});
        function sameEditorColor(value,hex){const normalized=String(value||'').toLowerCase().replace(/\s/g,'');const rgb=hex.slice(1).match(/../g).map(n=>parseInt(n,16));return normalized===hex.toLowerCase()||normalized==='rgb('+rgb.join(',')+')'||normalized==='rgba('+rgb.join(',')+',1)';}
        function lyricsToolActive(command){if(command==='bold')return document.queryCommandState('bold');if(command==='foreColor')return sameEditorColor(document.queryCommandValue(command),'#ff8787');if(command==='hiliteColor')return sameEditorColor(document.queryCommandValue(command),'#fef08a')||sameEditorColor(document.queryCommandValue('backColor'),'#fef08a');return false;}
        function updateLyricsTools(){document.querySelectorAll('[data-format]').forEach(button=>button.setAttribute('aria-pressed',String(lyricsToolActive(button.dataset.format))));}
        function execCmd(c,v=null){const editor=document.getElementById('lyricsEditor');editor.focus({preventScroll:true});if(lyricsSelection&&editor.contains(lyricsSelection.commonAncestorContainer)){const selection=window.getSelection();selection.removeAllRanges();selection.addRange(lyricsSelection);}if(c==='foreColor'&&lyricsToolActive(c))v='#1c1e21';if(c==='hiliteColor'&&lyricsToolActive(c))v='transparent';document.execCommand(c,false,v);const selection=window.getSelection();if(selection.rangeCount)lyricsSelection=selection.getRangeAt(0).cloneRange();updateLyricsTools();}

        function exportData() { const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([JSON.stringify(songs)],{type:'application/json'})); a.download='karaoke_backup.json'; a.click(); }
        function importData(i) { if(!i.files[0])return;const r=new FileReader();r.onload=e=>{try{const data=JSON.parse(e.target.result);if(!Array.isArray(data)||data.some(s=>!s||!Number.isFinite(s.id)||typeof s.title!=='string'||typeof s.artist!=='string'))throw Error();songs=data;persistSongs();renderList();notify('백업을 불러왔어요');}catch(err){notify('올바른 노래방 백업 파일이 아니에요');}i.value='';};r.readAsText(i.files[0]); }
        function clearData() { if(confirm('모든 곡을 휴지통으로 옮길까요?')) deleteSongs(songs.map(s=>s.id)); }
        

        let suppressCardUntil=0, sheetReturnFocus=null, cloudReady=false, cloudBusy=false, cloudAgain=false, cloudVersions={}, cloudBaseline={}, cloudTimer;
        let cloudMeta={};try{cloudMeta=JSON.parse(localStorage.getItem('karaoke_cloud_meta')||'{}');}catch(e){}
        cloudVersions=cloudMeta.versions||{};cloudBaseline=cloudMeta.baseline||{};
        const cloudPending=new Set(cloudMeta.pending||[]);
        function persistCloudMeta(){localStorage.setItem('karaoke_cloud_meta',JSON.stringify({versions:cloudVersions,baseline:cloudBaseline,pending:[...cloudPending]}));}
        function escapeText(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
        function notify(message){const el=document.getElementById('toast');el.textContent=message;el.style.opacity='1';clearTimeout(el._timer);el._timer=setTimeout(()=>el.style.opacity='0',2200);}
        function updateDeleteBar(){const bar=document.getElementById('deleteBar');bar.hidden=!isEditMode;document.body.classList.toggle('selecting',isEditMode);document.getElementById('selectionCount').textContent=selectedIds.size+'곡 선택';bar.querySelector('button').disabled=!selectedIds.size;}
        function deleteSelected(){deleteSongs([...selectedIds]);}
        function deleteSongs(ids){const removed=songs.filter(s=>ids.includes(s.id));if(!removed.length)return;let trash=[];try{trash=JSON.parse(localStorage.getItem('karaoke_v5_trash')||'[]');}catch(e){}trash.push(...removed.map(song=>({song,deletedAt:Date.now()})));try{localStorage.setItem('karaoke_v5_trash',JSON.stringify(trash));}catch(e){notify('휴지통을 저장하지 못해 삭제를 중단했어요');return;}songs=songs.filter(s=>!ids.includes(s.id));ids.forEach(id=>cloudPending.add(String(id)));selectedIds.clear();persistSongs();closeLyrics();renderList();notify(removed.length+'곡을 휴지통으로 옮겼어요');}
        function restoreTrash(){let trash=[];try{trash=JSON.parse(localStorage.getItem('karaoke_v5_trash')||'[]');}catch(e){}if(!trash.length){notify('휴지통이 비어 있어요');return;}trash.forEach(item=>{if(!songs.some(s=>s.id===item.song.id)){songs.unshift(item.song);cloudPending.add(String(item.song.id));}});persistSongs();localStorage.removeItem('karaoke_v5_trash');renderList();notify('휴지통의 곡을 복원했어요');}
        function persistSongs(){try{localStorage.setItem('karaoke_v5_data',JSON.stringify(songs));}catch(e){notify('기기 저장 공간을 확인해 주세요');return false;}{const current=new Map(songs.map(s=>[String(s.id),JSON.stringify(s)]));current.forEach((value,id)=>{if(cloudBaseline[id]!==value)cloudPending.add(id);});Object.keys(cloudBaseline).forEach(id=>{if(!current.has(id))cloudPending.add(id);});persistCloudMeta();if(cloudReady){clearTimeout(cloudTimer);cloudTimer=setTimeout(flushCloud,450);}}return true;}
        function openLyrics(){clearTimeout(sheetCloseTimer);document.getElementById('sheetBackdrop').classList.remove('sheet-fading');const popup=document.getElementById('lyricPopup');if(!popup.classList.contains('active'))sheetReturnFocus=document.activeElement;popup.inert=false;popup.setAttribute('aria-hidden','false');document.getElementById('sheetBackdrop').hidden=false;popup.classList.add('active');document.getElementById('sheetHandle').focus?.({preventScroll:true});}
        let sheetCloseTimer=0;
        function closeLyrics(){const popup=document.getElementById('lyricPopup');if(!popup.classList.contains('active'))return;popup.classList.remove('active');popup.style.removeProperty('transform');popup.inert=true;popup.setAttribute('aria-hidden','true');const backdrop=document.getElementById('sheetBackdrop');backdrop.classList.add('sheet-fading');clearTimeout(sheetCloseTimer);sheetCloseTimer=setTimeout(()=>{if(!popup.classList.contains('active')){backdrop.hidden=true;backdrop.classList.remove('sheet-fading');}},350);if(sheetReturnFocus&&sheetReturnFocus.isConnected)sheetReturnFocus.focus({preventScroll:true});}
        function bindSwipe(wrapper){const card=wrapper.querySelector('.song-card');let drag=null;card.addEventListener('pointerdown',e=>{if(isEditMode||e.button!==0)return;drag={x:e.clientX,y:e.clientY,offset:wrapper.classList.contains('swipe-open')?-82:0,locked:false};});card.addEventListener('pointermove',e=>{if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(!drag.locked&&Math.abs(dy)>10&&Math.abs(dy)>Math.abs(dx)){drag=null;return;}if(!drag.locked&&Math.abs(dx)>10){drag.locked=true;card.setPointerCapture(e.pointerId);document.querySelectorAll('.swipe-open').forEach(row=>{if(row!==wrapper)row.classList.remove('swipe-open');});card.style.transition='none';}if(drag.locked){e.preventDefault();card.style.transform='translateX('+Math.min(0,Math.max(-96,drag.offset+dx))+'px)';}});function finish(e){if(!drag)return;if(drag.locked){wrapper.classList.toggle('swipe-open',drag.offset+e.clientX-drag.x < -35);suppressCardUntil=Date.now()+350;}card.style.removeProperty('transition');card.style.removeProperty('transform');drag=null;}card.addEventListener('pointerup',finish);card.addEventListener('pointercancel',()=>{card.style.removeProperty('transition');card.style.removeProperty('transform');drag=null;});}
        const sheetHandle=document.getElementById('sheetHandle');let sheetDrag=null;sheetHandle.addEventListener('pointerdown',e=>{sheetDrag={y:e.clientY};sheetHandle.setPointerCapture(e.pointerId);});sheetHandle.addEventListener('pointermove',e=>{if(!sheetDrag)return;const delta=Math.max(0,e.clientY-sheetDrag.y);document.getElementById('lyricPopup').style.transform='translateY('+delta+'px)';});function finishSheet(e){if(!sheetDrag)return;const down=e.clientY-sheetDrag.y;sheetDrag=null;document.getElementById('lyricPopup').style.removeProperty('transform');if(down>85)closeLyrics();}sheetHandle.addEventListener('pointerup',finishSheet);sheetHandle.addEventListener('pointercancel',()=>{sheetDrag=null;document.getElementById('lyricPopup').style.removeProperty('transform');});
        document.addEventListener('keydown',e=>{const popup=document.getElementById('lyricPopup');if(!popup.classList.contains('active'))return;if(e.key==='Escape')closeLyrics();if(e.key==='Tab'){const buttons=[...popup.querySelectorAll('button')],first=buttons[0],last=buttons[buttons.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
        function cloudMessage(text){document.getElementById('cloudStatus').textContent=text;}
        async function cloudCall(name,payload){const response=await fetch('/api/rpc',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:name,payload})});const result=await response.json();if(response.status===401){lockApp();startAuth();}if(!response.ok||!result.ok)throw Error(result.error||'데이터 연결 실패');return result.data;}
        async function initializeCloud(){if(cloudBusy)return;cloudBusy=true;cloudMessage('Google 데이터 연결 중…');try{const data=await cloudCall('read'),remote=data.records||{};const previousBaseline=cloudBaseline;const local=new Map(songs.map(s=>[String(s.id),s]));Object.keys(remote).forEach(id=>{const record=remote[id];cloudVersions[id]=record.version;if(!cloudPending.has(id)){if(record.deleted){local.delete(id);delete cloudBaseline[id];}else{local.set(id,record.song);cloudBaseline[id]=JSON.stringify(record.song);}}});songs=[...local.values()];cloudReady=true;persistCloudMeta();persistSongs();renderList();cloudMessage('Google 데이터 연결 완료');}catch(e){cloudMessage('연결 실패 · 기기 기록은 유지됩니다');}finally{cloudBusy=false;}if(cloudReady)flushCloud();}
        async function flushCloud(){if(!cloudReady||cloudBusy){cloudAgain=true;return;}if(!cloudPending.size)return;cloudBusy=true;const ids=[...cloudPending],changes={};ids.forEach(id=>{const song=songs.find(s=>String(s.id)===id);changes[id]={version:cloudVersions[id]||0,song:song||null,deleted:!song};cloudPending.delete(id);});cloudMessage('Google에 저장 중…');try{const result=await cloudCall('write',{changes});Object.keys(result.records||{}).forEach(id=>{const r=result.records[id];cloudVersions[id]=r.version;if(!cloudPending.has(id)){songs=songs.filter(s=>String(s.id)!==id);if(!r.deleted)songs.push(r.song);if(r.deleted)delete cloudBaseline[id];else cloudBaseline[id]=JSON.stringify(r.song);}});localStorage.setItem('karaoke_v5_data',JSON.stringify(songs));persistCloudMeta();renderList();cloudMessage(result.conflict?'다른 기기의 최신 변경을 반영했어요':'Google 저장 완료');}catch(e){ids.forEach(id=>cloudPending.add(id));persistCloudMeta();cloudMessage('저장 실패 · 기기 기록 보존 · 다시 시도해 주세요');}finally{cloudBusy=false;}if(cloudAgain){cloudAgain=false;flushCloud();}}
        document.addEventListener('visibilitychange',()=>{if(!document.hidden&&cloudReady&&!cloudBusy&&!cloudPending.size)initializeCloud();});
    
/* Keep the fixed app viewport aligned with the visible area when keyboards open. */
(function setupAppViewport(){
  const root=document.documentElement;
  let frame=0;
  function syncViewport(){
    cancelAnimationFrame(frame);
    frame=requestAnimationFrame(()=>{
      const viewport=window.visualViewport;
      const visibleHeight=viewport?viewport.height:window.innerHeight;
      root.style.setProperty('--app-visible-height',Math.max(1,visibleHeight)+'px');
      const keyboardOpen=!!(viewport&&document.activeElement&&document.activeElement.matches('input,textarea,[contenteditable="true"]')&&window.innerHeight-visibleHeight>140);
      document.body.classList.toggle('keyboard-open',!!keyboardOpen);
    });
  }
  syncViewport();
  window.addEventListener('resize',syncViewport,{passive:true});
  window.visualViewport?.addEventListener('resize',syncViewport,{passive:true});
  window.visualViewport?.addEventListener('scroll',syncViewport,{passive:true});
})();

/* v12.0: suppress pinch and double-tap page zoom without blocking normal scrolling. */
document.addEventListener('gesturestart',e=>e.preventDefault(),{passive:false});
document.addEventListener('gesturechange',e=>e.preventDefault(),{passive:false});
let zoomTouchEnd=0;
document.addEventListener('touchend',e=>{if(e.changedTouches.length!==1)return;const now=Date.now();if(now-zoomTouchEnd<300&&e.target.closest('button,a,input,textarea,select')===null)e.preventDefault();zoomTouchEnd=now;},{passive:false});
document.addEventListener('touchmove',e=>{if(e.touches.length>1)e.preventDefault();},{passive:false});

        async function refreshAppAssets(button){
            if(button){button.disabled=true;button.querySelector('span').textContent='최신 화면 불러오는 중…';}
            try{
                if('caches' in window){const keys=await caches.keys();await Promise.all(keys.map(key=>caches.delete(key)));}
                if('serviceWorker' in navigator){const registrations=await navigator.serviceWorker.getRegistrations();await Promise.all(registrations.filter(r=>new URL(r.scope).origin===location.origin).map(r=>r.unregister()));}
            }catch(error){console.warn('일부 캐시 정리에 실패했어요',error);}
            const url=new URL(location.href);
            url.searchParams.set('refresh',Date.now().toString());
            location.replace(url.toString());
        }
