
        let authToken='cookie',authSetup=false,appInitialized=false;
        async function authRpc(method,...args){const payload={action:method};if(method==='login')payload.password=args[0];const response=await fetch('/api/rpc',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const result=await response.json();if(!response.ok||!result.ok)throw Error(result.error||'연결하지 못했어요');return result.data;}
        function lockApp(){document.body.classList.add('auth-locked');document.getElementById('authGate').hidden=false;cloudReady=false;clearTimeout(cloudTimer);}
        function unlockApp(){document.body.classList.remove('auth-locked');document.getElementById('authGate').hidden=true;if(!appInitialized){appInitialized=true;initApp();}else initializeCloud();}
        async function startAuth(){lockApp();try{try{await authRpc('session');unlockApp();return;}catch(e){if(e.message!=='AUTH_REQUIRED')throw e;}const state=await authRpc('status');authSetup=false;document.getElementById('authDescription').textContent=state.configured?'비밀번호를 입력해 주세요.\n같은 기기에서는 로그인이 유지됩니다.':'소유자의 최초 비밀번호 설정이 필요해요.';document.getElementById('authPassword').hidden=!state.configured;document.getElementById('authSubmit').hidden=!state.configured;document.getElementById('authSubmit').textContent='로그인';}catch(e){document.getElementById('authMessage').textContent=e.message||'연결하지 못했어요';}}
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
            
            // 서식 없는 붙여넣기 강제
            document.getElementById('lyricsEditor').addEventListener('paste', (e) => {
                e.preventDefault();
                const text = (e.originalEvent || e).clipboardData.getData('text/plain');
                document.execCommand('insertText', false, text);
            });
        }

        function switchTab(tabId, el) {
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
            closeLyrics();
            if(tabId !== 'home' && isEditMode) toggleEditMode();
            document.getElementById('tab-' + tabId).classList.add('active');
            el.classList.add('active');
            if(tabId === 'home') renderList();
            window.scrollTo(0,0);
        }

        function resetAllStates() {
            document.getElementById('searchInput').value = '';
            currentFilter = 'ALL';
            document.querySelectorAll('.filter-pill').forEach(btn=>btn.classList.toggle('active',btn.id==='pill-ALL'));
            if(isEditMode) toggleEditMode();
            document.getElementById('editingId').value = '';
            document.querySelectorAll('#tab-add input[type="text"]').forEach(i => i.value = '');
            document.getElementById('lyricsEditor').innerHTML = '';
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
        function openLyrics(){const popup=document.getElementById('lyricPopup');if(!popup.classList.contains('active'))sheetReturnFocus=document.activeElement;popup.inert=false;popup.setAttribute('aria-hidden','false');document.getElementById('sheetBackdrop').hidden=false;popup.classList.add('active');document.querySelector('.sheet-close').focus({preventScroll:true});}
        function closeLyrics(){const popup=document.getElementById('lyricPopup');popup.classList.remove('active');popup.style.removeProperty('transform');popup.inert=true;popup.setAttribute('aria-hidden','true');document.getElementById('sheetBackdrop').hidden=true;if(sheetReturnFocus&&sheetReturnFocus.isConnected)sheetReturnFocus.focus({preventScroll:true});}
        function bindSwipe(wrapper){const card=wrapper.querySelector('.song-card');let drag=null;card.addEventListener('pointerdown',e=>{if(isEditMode||e.button!==0)return;drag={x:e.clientX,y:e.clientY,offset:wrapper.classList.contains('swipe-open')?-82:0,locked:false};});card.addEventListener('pointermove',e=>{if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(!drag.locked&&Math.abs(dy)>10&&Math.abs(dy)>Math.abs(dx)){drag=null;return;}if(!drag.locked&&Math.abs(dx)>10){drag.locked=true;card.setPointerCapture(e.pointerId);document.querySelectorAll('.swipe-open').forEach(row=>{if(row!==wrapper)row.classList.remove('swipe-open');});card.style.transition='none';}if(drag.locked){e.preventDefault();card.style.transform='translateX('+Math.min(0,Math.max(-96,drag.offset+dx))+'px)';}});function finish(e){if(!drag)return;if(drag.locked){wrapper.classList.toggle('swipe-open',drag.offset+e.clientX-drag.x < -35);suppressCardUntil=Date.now()+350;}card.style.removeProperty('transition');card.style.removeProperty('transform');drag=null;}card.addEventListener('pointerup',finish);card.addEventListener('pointercancel',()=>{card.style.removeProperty('transition');card.style.removeProperty('transform');drag=null;});}
        const sheetHandle=document.getElementById('sheetHandle');let sheetDrag=null;sheetHandle.addEventListener('pointerdown',e=>{sheetDrag={y:e.clientY};sheetHandle.setPointerCapture(e.pointerId);});sheetHandle.addEventListener('pointermove',e=>{if(!sheetDrag)return;const delta=Math.max(0,e.clientY-sheetDrag.y);document.getElementById('lyricPopup').style.transform='translateY('+delta+'px)';});function finishSheet(e){if(!sheetDrag)return;const down=e.clientY-sheetDrag.y;sheetDrag=null;document.getElementById('lyricPopup').style.removeProperty('transform');if(down>85)closeLyrics();}sheetHandle.addEventListener('pointerup',finishSheet);sheetHandle.addEventListener('pointercancel',()=>{sheetDrag=null;document.getElementById('lyricPopup').style.removeProperty('transform');});
        document.addEventListener('keydown',e=>{const popup=document.getElementById('lyricPopup');if(!popup.classList.contains('active'))return;if(e.key==='Escape')closeLyrics();if(e.key==='Tab'){const buttons=[...popup.querySelectorAll('button')],first=buttons[0],last=buttons[buttons.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
        function cloudMessage(text){document.getElementById('cloudStatus').textContent=text;}
        async function cloudCall(name,payload){const response=await fetch('/api/rpc',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:name,payload})});const result=await response.json();if(response.status===401){lockApp();startAuth();}if(!response.ok||!result.ok)throw Error(result.error||'데이터 연결 실패');return result.data;}
        async function initializeCloud(){if(cloudBusy)return;cloudBusy=true;cloudMessage('Google 데이터 연결 중…');try{const data=await cloudCall('read'),remote=data.records||{};const previousBaseline=cloudBaseline;const local=new Map(songs.map(s=>[String(s.id),s]));Object.keys(remote).forEach(id=>{const record=remote[id];cloudVersions[id]=record.version;if(!cloudPending.has(id)){if(record.deleted){local.delete(id);delete cloudBaseline[id];}else{local.set(id,record.song);cloudBaseline[id]=JSON.stringify(record.song);}}});songs=[...local.values()];cloudReady=true;persistCloudMeta();persistSongs();renderList();cloudMessage('Google 데이터 연결 완료');}catch(e){cloudMessage('연결 실패 · 기기 기록은 유지됩니다');}finally{cloudBusy=false;}if(cloudReady)flushCloud();}
        async function flushCloud(){if(!cloudReady||cloudBusy){cloudAgain=true;return;}if(!cloudPending.size)return;cloudBusy=true;const ids=[...cloudPending],changes={};ids.forEach(id=>{const song=songs.find(s=>String(s.id)===id);changes[id]={version:cloudVersions[id]||0,song:song||null,deleted:!song};cloudPending.delete(id);});cloudMessage('Google에 저장 중…');try{const result=await cloudCall('write',{changes});Object.keys(result.records||{}).forEach(id=>{const r=result.records[id];cloudVersions[id]=r.version;if(!cloudPending.has(id)){songs=songs.filter(s=>String(s.id)!==id);if(!r.deleted)songs.push(r.song);if(r.deleted)delete cloudBaseline[id];else cloudBaseline[id]=JSON.stringify(r.song);}});localStorage.setItem('karaoke_v5_data',JSON.stringify(songs));persistCloudMeta();renderList();cloudMessage(result.conflict?'다른 기기의 최신 변경을 반영했어요':'Google 저장 완료');}catch(e){ids.forEach(id=>cloudPending.add(id));persistCloudMeta();cloudMessage('저장 실패 · 기기 기록 보존 · 다시 시도해 주세요');}finally{cloudBusy=false;}if(cloudAgain){cloudAgain=false;flushCloud();}}
        document.addEventListener('visibilitychange',()=>{if(!document.hidden&&cloudReady&&!cloudBusy&&!cloudPending.size)initializeCloud();});
    