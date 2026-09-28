// Comportement du compagnon : humeurs, animations, réactions à la souris.
(() => {
  const api = window.petAPI;
  const petEl = document.getElementById('pet');
  const jumpEl = document.getElementById('jump');
  const creatureEl = document.getElementById('creature');
  const eyesOpenEl = creatureEl.querySelector('.eyes-open');
  const bubbleEl = document.getElementById('bubble');
  const bubbleText = document.getElementById('bubble-text');
  const heartsEl = document.getElementById('hearts');
  const askEl = document.getElementById('ask');
  const askInput = document.getElementById('ask-input');
  const talkToggle = document.getElementById('talk-toggle');
  const talkEl = document.getElementById('talk');
  const talkLog = document.getElementById('talk-log');
  const talkInput = document.getElementById('talk-input');

  const talk = { open: false, loaded: false }; // la discussion (voir plus bas)

  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  const rand = (min, max) => min + Math.random() * (max - min);

  const PHRASES = {
    click: ['Coucou !', 'Hihi, ça chatouille !', 'Oui ?', 'Je suis là !', 'Hop !', 'On fait quoi ?'],
    love: ['Moi aussi je t\'aime bien !', 'Trop mignon !', '<3'],
    pet: ['Ronron...', 'Encore, encore !', 'Mmmh, c\'est agréable...'],
    dizzy: ['Arrête, j\'ai le tournis !', 'Ouh là là...', 'Tout tourne !'],
    drag: ['Wiiii !', 'Où on va ?', 'Doucement !'],
    drop: ['Ouf !', 'Joli coin.', 'Merci pour le voyage !'],
    wake: ['Hein ? Quoi ?', 'Je ne dormais pas !', 'Mmh... bonjour.'],
    idle: ['Tranquille...', 'Je me demande ce que tu fais.', 'La vie de compagnon, c\'est chouette.'],
    yawn: ['Aaaah...', 'Petite fatigue...'],
  };

  // ------------------------------------------------------------------
  // Humeur
  // ------------------------------------------------------------------

  let baseMood = 'idle'; // humeur de repos : idle, sleepy (fatigué) ou sleeping
  let restMood = 'idle'; // humeur au réveil : sleepy quand ton quota Claude est bas
  let mood = 'idle';
  let moodTimer = null;

  function setMood(next, duration) {
    clearTimeout(moodTimer);
    mood = next;
    petEl.dataset.mood = next;
    if (duration) moodTimer = setTimeout(() => setMood(baseMood), duration);
  }

  function play(animation) {
    jumpEl.className = '';
    void jumpEl.offsetWidth; // relance l'animation même si c'est la même
    jumpEl.className = `anim-${animation}`;
  }
  jumpEl.addEventListener('animationend', (e) => {
    if (e.target === jumpEl) jumpEl.className = '';
  });

  // ------------------------------------------------------------------
  // Bulle
  // ------------------------------------------------------------------

  let bubbleTimer = null;

  function say(text, duration) {
    if (talk.open) { talkLine('info', text); return; } // discussion ouverte : ça va dans le fil
    clearTimeout(bubbleTimer);
    if (chat.answering) return; // ne coupe pas une réponse de Claude
    bubbleEl.classList.remove('leaving', 'chat');
    fitHeight(0);
    bubbleText.textContent = text;
    bubbleEl.hidden = false;
    // relance l'animation d'apparition
    bubbleText.style.animation = 'none';
    void bubbleText.offsetWidth;
    bubbleText.style.animation = '';
    const ms = duration || Math.min(7000, 1800 + text.length * 70);
    bubbleTimer = setTimeout(hideBubble, ms);
  }

  function hideBubble() {
    clearTimeout(bubbleTimer);
    if (bubbleEl.hidden) return;
    bubbleEl.classList.add('leaving');
    bubbleTimer = setTimeout(() => {
      bubbleEl.hidden = true;
      bubbleEl.classList.remove('chat');
      fitHeight(0);
    }, 200);
  }

  // La fenêtre grandit vers le haut quand la bulle est longue, puis reprend sa taille.
  const BASE_HEIGHT = 300;
    let lastHeight = BASE_HEIGHT;
  function fitHeight(contentHeight) {
    if (talk.open) contentHeight = Math.max(contentHeight, talkEl.offsetHeight);
    const wanted = contentHeight ? Math.max(BASE_HEIGHT, (parseFloat(getComputedStyle(bubbleEl).bottom) || 125) + contentHeight + 24) : BASE_HEIGHT;
    if (wanted === lastHeight) return;
    lastHeight = wanted;
    api.setHeight(wanted);
  }

  function hearts(count = 4) {
    for (let i = 0; i < count; i++) {
      setTimeout(() => {
        const h = document.createElement('span');
        h.className = 'heart';
        h.textContent = '♥';
        h.style.left = `${rand(30, 130)}px`;
        h.style.top = `${rand(30, 80)}px`;
        heartsEl.appendChild(h);
        setTimeout(() => h.remove(), 1500);
      }, i * 180);
    }
  }

  // ------------------------------------------------------------------
  // Sommeil
  // ------------------------------------------------------------------

  let sleepTimer = null;

  function sleep() {
    if (baseMood === 'sleeping') return;
    baseMood = 'sleeping';
    hideBubble();
    setMood('sleepy');
    clearTimeout(sleepTimer);
    sleepTimer = setTimeout(() => {
      if (baseMood !== 'sleeping') return;
      setMood('sleeping');
      document.body.classList.add('sleeping');
    }, 1800);
  }

  function wake() {
    if (baseMood !== 'sleeping') return;
    clearTimeout(sleepTimer);
    baseMood = restMood;
    document.body.classList.remove('sleeping');
    setMood('surprised', 1200);
    play('stretch');
  }

  // ------------------------------------------------------------------
  // Clignement des yeux
  // ------------------------------------------------------------------

  function scheduleBlink() {
    setTimeout(() => {
      if (mood === 'idle' || mood === 'thinking') {
        eyesOpenEl.classList.add('blink');
        setTimeout(() => eyesOpenEl.classList.remove('blink'), 140);
        // parfois un double clignement
        if (Math.random() < 0.2) {
          setTimeout(() => {
            eyesOpenEl.classList.add('blink');
            setTimeout(() => eyesOpenEl.classList.remove('blink'), 120);
          }, 300);
        }
      }
      scheduleBlink();
    }, rand(2200, 6000));
  }

  // ------------------------------------------------------------------
  // Regard qui suit la souris + zones cliquables
  // ------------------------------------------------------------------

  let hovering = false;
  let dragging = false;
  let ignoring = true;

  function setIgnore(ignore) {
    if (ignore === ignoring) return;
    ignoring = ignore;
    api.setIgnoreMouse(ignore);
  }

  // Vrai quand le point est sur une forme de la créature (pas sur la transparence),
  // sur la ligne pour écrire ou sur une réponse de Claude.
  function isOverCreature(x, y) {
    const el = document.elementFromPoint(x, y);
    if (!el) return false;
    if (!askEl.hidden && askEl.contains(el)) return true;
    if (talkToggle.contains(el) && !document.body.classList.contains('talking')) return true;
    if (!talkEl.hidden && talkEl.contains(el)) return true;
    if (!bubbleEl.hidden && bubbleEl.classList.contains('chat') && el === bubbleText) return true;
    return el !== creatureEl && creatureEl.contains(el);
  }

  function lookAt(x, y) {
    const r = creatureEl.getBoundingClientRect();
    const cx = r.left + r.width * 0.5;
    const cy = r.top + r.height * 0.54;
    let dx = x - cx;
    let dy = y - cy;
    if (mood === 'thinking') { dx = 60; dy = -80; }
    const dist = Math.hypot(dx, dy) || 1;
    const strength = Math.min(dist / 120, 1);
    const ux = (dx / dist) * strength;
    const uy = (dy / dist) * strength;
    // Déplacement par demi-pixels du dessin pour garder l'effet pixel art.
    eyesOpenEl.style.transform = `translate(${Math.round(ux * 1.4) * 5}px, ${Math.round(uy * 1.2) * 5}px)`;
  }

  api.onCursor(({ x, y }) => {
    lookAt(x, y);
    const inside = x >= 0 && y >= 0 && x < window.innerWidth && y < window.innerHeight;
    const over = inside && isOverCreature(x, y);
    if (over !== hovering) {
      hovering = over;
      if (!over) petStroke.reset();
    }
    setIgnore(!(over || dragging));
  });

  // ------------------------------------------------------------------
  // Clics, glisser-déposer, caresses
  // ------------------------------------------------------------------

  let press = null;
  let clickTimes = [];
  let activateTimer = null;

  petEl.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    press = { x: e.screenX, y: e.screenY, id: e.pointerId };
    petEl.setPointerCapture(e.pointerId);
  });

  petEl.addEventListener('pointermove', (e) => {
    if (press && !dragging && Math.hypot(e.screenX - press.x, e.screenY - press.y) > 5) {
      startDrag();
      return;
    }
    if (dragging) { trackMove(e); return; }
    if (!press && hovering) petStroke.move(e.movementX);
  });

  petEl.addEventListener('pointerup', (e) => {
    if (!press) return;
    petEl.releasePointerCapture(press.id);
    press = null;
    if (dragging) endDrag();
    else onClick(e);
  });

  petEl.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    api.showContextMenu();
  });

  // Pendant le déplacement : il marche ou vole dans le sens du mouvement,
  // et pend comme une peluche quand tu t'arrêtes.
  let lastMove = null;
  let stillTimer = null;
  function trackMove(e) {
    const now = performance.now();
    if (lastMove) {
      const dt = Math.max(now - lastMove.t, 1);
      const vx = (e.screenX - lastMove.x) / dt;
      const speed = Math.hypot(e.screenX - lastMove.x, e.screenY - lastMove.y) / dt;
      if (speed > 0.15 && petEl.dataset.energy !== 'ko') {
        if (!petEl.classList.contains('moving')) setMood('happy');
        petEl.classList.add('moving');
        if (Math.abs(vx) > 0.1) petEl.dataset.dir = vx < 0 ? 'left' : 'right';
        clearTimeout(stillTimer);
        stillTimer = setTimeout(() => petEl.classList.remove('moving'), 250);
      }
    }
    lastMove = { x: e.screenX, y: e.screenY, t: now };
  }

  function startDrag() {
    lastMove = null;
    dragging = true;
    setIgnore(false);
    petEl.classList.add('dragging');
    setMood('surprised');
    if (Math.random() < 0.5) say(pick(PHRASES.drag), 1500);
    api.dragStart();
  }

  function endDrag() {
    dragging = false;
    clearTimeout(stillTimer);
    petEl.classList.remove('moving');
    delete petEl.dataset.dir;
    api.dragEnd();
    petEl.classList.remove('dragging');
    play('squash');
    if (baseMood === 'sleeping') wake();
    setMood('happy', 900);
    if (Math.random() < 0.4) say(pick(PHRASES.drop), 1800);
  }

  function onClick() {
    if (baseMood === 'sleeping') {
      wake();
      say(pick(PHRASES.wake));
      api.emit('clicked', { woke: true });
      return;
    }

    const now = Date.now();
    clickTimes = clickTimes.filter((t) => now - t < 1500);
    clickTimes.push(now);
    const count = clickTimes.length;
    clearTimeout(activateTimer);

    if (count >= 5) {
      clickTimes = [];
      setMood('dizzy', 3000);
      play('shake');
      say(pick(PHRASES.dizzy));
      api.emit('dizzy');
    } else if (count === 2 && now - clickTimes[0] < 400) {
      setMood('love', 2200);
      play('spin');
      hearts(5);
      say(pick(PHRASES.love));
      api.emit('double-clicked');
    } else if (count === 1) {
      play('hop');
      api.emit('clicked', { woke: false });
      // Un simple clic l'active pour parler (on attend de voir si c'est un double clic).
      if (chat.open) closeAsk();
      else activateTimer = setTimeout(() => openAsk(), 380);
    } else {
      play('wiggle');
    }
  }

  // Caresse : des allers-retours de la souris au-dessus de lui sans cliquer.
  const petStroke = {
    distance: 0,
    turns: 0,
    lastDir: 0,
    since: 0,
    cooldownUntil: 0,
    reset() { this.distance = 0; this.turns = 0; this.lastDir = 0; this.since = Date.now(); },
    move(dx) {
      const now = Date.now();
      if (now < this.cooldownUntil || baseMood === 'sleeping' || !dx) return;
      if (now - this.since > 2000) this.reset();
      const dir = Math.sign(dx);
      if (this.lastDir && dir !== this.lastDir) this.turns++;
      this.lastDir = dir;
      this.distance += Math.abs(dx);
      if (this.distance > 250 && this.turns >= 3) {
        this.cooldownUntil = now + 5000;
        this.reset();
        setMood('love', 2500);
        play('wiggle');
        hearts(3);
        say(pick(PHRASES.pet));
        api.emit('petted');
      }
    },
  };

  // ------------------------------------------------------------------
  // Vie autonome : petits gestes quand il ne se passe rien
  // ------------------------------------------------------------------

  function idleBehaviour() {
    setTimeout(() => {
      if (baseMood === 'idle' && mood === 'idle' && !dragging) {
        const hour = new Date().getHours();
        const late = hour >= 23 || hour < 6;
        const roll = Math.random();
        if (late && roll < 0.35) {
          setMood('sleepy', 2000);
          play('stretch');
          say(pick(PHRASES.yawn), 2000);
        } else if (roll < 0.3) {
          play('hop');
        } else if (roll < 0.5) {
          play('wiggle');
        } else if (roll < 0.65) {
          play('stretch');
        } else if (roll < 0.8) {
          setMood('thinking', 2500);
        } else if (roll < 0.87 && !quiet) {
          say(pick(PHRASES.idle));
        }
      }
      idleBehaviour();
    }, rand(9000, 22000));
  }

  // ------------------------------------------------------------------
  // Évolution (le stade est décidé par le module evolution du processus principal)
  // ------------------------------------------------------------------

  function setStage(stage) {
    petEl.dataset.stage = String(stage);
  }

  function evolve(stage, name) {
    hideBubble();
    setMood('surprised');
    petEl.classList.add('evolving');
    play('stretch');
    setTimeout(() => setStage(stage), 800);
    setTimeout(() => {
      petEl.classList.remove('evolving');
      setMood('happy', 3000);
      play('hop');
      hearts(5);
      say(`Je deviens ${name} !`, 4500);
    }, 1700);
  }

  // ------------------------------------------------------------------
  // Parler avec Claude : un clic l'active, une petite ligne apparaît,
  // et sa réponse s'affiche dans sa propre bulle.
  // ------------------------------------------------------------------

  const chat = { open: false, mode: 'chat', answering: null, text: '', status: '', projet: '', line: null };

  async function openAsk(mode) {
    if (baseMood === 'sleeping') wake();
    if (talk.open && mode !== 'key') { api.focus(); talkInput.focus(); return; } // on écrit dans la discussion
    let wanted = mode;
    if (!wanted) {
      const state = await api.chatState();
      wanted = state.hasKey ? 'chat' : 'key';
    }
    chat.open = true;
    chat.mode = wanted;
    hideBubble();
    askEl.classList.remove('error');
    askInput.value = '';
    askInput.type = wanted === 'key' ? 'password' : 'text';
    askInput.placeholder = wanted === 'key' ? 'Colle ta clé API Anthropic (sk-ant-...)' : 'Dis-moi...';
    askEl.hidden = false;
    setIgnore(false);
    setMood('happy');
    api.focus();
    askInput.focus();
    if (wanted === 'key') {
      say('Pour parler avec Claude, il me faut ta clé API.', 6000);
    }
  }

  function closeAsk() {
    if (!chat.open) return;
    chat.open = false;
    askEl.hidden = true;
    askInput.blur();
    if (mood === 'happy') setMood(baseMood);
    if (chat.mode === 'key') hideBubble();
  }

  askEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = askInput.value.trim();
    if (!text) return;
    if (chat.mode === 'key') {
      askInput.disabled = true;
      const res = await api.saveKey(text);
      askInput.disabled = false;
      if (res.ok) {
        closeAsk();
        say('Clé enregistrée ! Clique sur moi pour me parler.', 4000);
      } else {
        askEl.classList.add('error');
        askInput.value = '';
        askInput.focus();
        bubbleEl.classList.remove('chat');
        say(res.message, 6000);
      }
      return;
    }
    closeAsk();
    ask(text);
  });

  askInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAsk();
  });
  // Cliquer ailleurs referme la ligne si elle est vide.
  window.addEventListener('blur', () => {
    if (chat.open && !askInput.value.trim()) closeAsk();
  });

  function ask(text, { voice: spoken = false } = {}) {
    const id = `q${Date.now()}`;
    if (spoken) voice.speakFor = id; // tu lui as parlé au micro : il répondra à voix haute
    chat.answering = id;
    chat.text = '';
    chat.status = '';
    chat.projet = '';
    chat.line = null;
    if (talk.open) {
      talkLine('moi', text);
      chat.line = talkLine('lui', '');
      chat.status = '…';
      showAnswer();
    }
    hideBubble();
    setMood('thinking');
    api.ask(id, text);
  }

  // Formatage minimal : Claude répond en texte simple, on retire le markdown restant.
  const plain = (t) => t.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/`{1,3}/g, '');

  function showAnswer() {
    if (chat.line) { // la discussion est ouverte : la réponse s'écrit dans le fil
      const answer = plain(chat.text).trim();
      chat.line.textContent = answer;
      if (!answer && chat.status) chat.line.appendChild(Object.assign(document.createElement('em'), { className: 'status', textContent: chat.status }));
      if (answer && chat.projet) chat.line.appendChild(Object.assign(document.createElement('small'), { className: 'projet', textContent: `rangé dans « ${chat.projet} »` }));
      talkLog.scrollTop = talkLog.scrollHeight;
      return;
    }
    clearTimeout(bubbleTimer);
    bubbleEl.classList.remove('leaving');
    bubbleEl.classList.add('chat');
    bubbleEl.hidden = false;
    const answer = plain(chat.text).trim();
    bubbleText.textContent = answer;
    if (!answer && chat.status) {
      const wait = document.createElement('em');
      wait.className = 'status';
      wait.textContent = chat.status;
      bubbleText.appendChild(wait);
    }
    if (answer && chat.projet) {
      const tag = document.createElement('small');
      tag.className = 'projet';
      tag.textContent = `rangé dans « ${chat.projet} »`;
      bubbleText.appendChild(tag);
    }
    fitHeight(bubbleText.offsetHeight);
    bubbleText.scrollTop = bubbleText.scrollHeight;
  }

  // Temps de lecture : la bulle reste le temps de lire, et tant que la souris est dessus.
  function scheduleAnswerHide() {
    clearTimeout(bubbleTimer);
    const ms = Math.min(45000, 5000 + chat.text.length * 55);
    bubbleTimer = setTimeout(hideBubble, ms);
  }
  bubbleText.addEventListener('mouseenter', () => {
    if (bubbleEl.classList.contains('chat') && !chat.answering) clearTimeout(bubbleTimer);
  });
  bubbleText.addEventListener('mouseleave', () => {
    if (bubbleEl.classList.contains('chat') && !chat.answering) {
      clearTimeout(bubbleTimer);
      bubbleTimer = setTimeout(hideBubble, 2500);
    }
  });
  // Un double clic sur la réponse la ferme tout de suite.
  bubbleText.addEventListener('dblclick', () => {
    if (bubbleEl.classList.contains('chat')) hideBubble();
  });

  function onChatDelta({ id, delta }) {
    if (id !== chat.answering) return;
    chat.text += delta;
    showAnswer();
  }

  function onChatDone({ id, projet, text }) {
    if (id !== chat.answering) return;
    if (typeof text === 'string') chat.text = text; // version nettoyée (sans balises)
    chat.answering = null;
    chat.status = '';
    chat.projet = projet || '';
    if (voice.speakFor === id) { voice.speakFor = null; speakAloud(plain(chat.text)); }
    if (chat.line) {
      showAnswer();
      if (!chat.text.trim()) chat.line.remove();
      chat.line = null;
      if (!talk.open) talkToggle.classList.add('unread');
      return;
    }
    if (chat.text.trim()) { showAnswer(); scheduleAnswerHide(); } else hideBubble();
  }

  // ------------------------------------------------------------------
  // Micro et voix : tu appuies sur le micro, tu parles, il s'arrête tout
  // seul quand tu te tais (ou re-clic). Ta voix devient du texte sur ton PC
  // (whisper.cpp), et sa réponse est lue à voix haute (Piper), seulement
  // quand tu lui as parlé au micro.
  // ------------------------------------------------------------------

  const micBtn = document.getElementById('talk-mic');
  const voice = { rec: null, speakFor: null, audio: null };

  function wavFrom(chunks, rate) {
    const n = chunks.reduce((a, c) => a + c.length, 0);
    const buf = new ArrayBuffer(44 + n * 2);
    const v = new DataView(buf);
    const str = (o, t) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
    str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVEfmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    str(36, 'data'); v.setUint32(40, n * 2, true);
    let o = 44;
    for (const c of chunks) for (let i = 0; i < c.length; i++, o += 2) v.setInt16(o, Math.max(-1, Math.min(1, c[i])) * 0x7fff, true);
    return buf;
  }

  async function record() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
    const ctx = new AudioContext({ sampleRate: 16000 });
    const src = ctx.createMediaStreamSource(stream);
    const proc = ctx.createScriptProcessor(4096, 1, 1);
    const chunks = [];
    let heard = false;
    let quietFor = 0;
    const started = performance.now();
    return new Promise((resolve) => {
      const stop = () => {
        if (!voice.rec) return;
        voice.rec = null;
        proc.disconnect(); src.disconnect();
        stream.getTracks().forEach((t) => t.stop());
        ctx.close();
        resolve(heard ? wavFrom(chunks, ctx.sampleRate) : null);
      };
      voice.rec = { stop };
      proc.onaudioprocess = (e) => {
        const data = new Float32Array(e.inputBuffer.getChannelData(0));
        chunks.push(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
        const loud = Math.sqrt(sum / data.length) > 0.02;
        const ms = (data.length / ctx.sampleRate) * 1000;
        if (loud) { heard = true; quietFor = 0; } else quietFor += ms;
        const elapsed = performance.now() - started;
        if ((heard && quietFor > 1400) || elapsed > 30000 || (!heard && elapsed > 8000)) stop();
      };
      src.connect(proc);
      proc.connect(ctx.destination);
    });
  }

  function setVoiceStatus(status) {
    if (talk.open) talkInput.placeholder = status || 'Dis-moi...';
    else if (status) say(status, 4000);
  }

  async function toggleMic() {
    if (voice.audio) { voice.audio.pause(); voice.audio = null; }
    if (voice.rec) { voice.rec.stop(); return; }
    if (micBtn.classList.contains('busy')) return;
    micBtn.classList.add('busy');
    try {
      if (!(await api.voiceReady())) return;
      micBtn.classList.add('recording');
      setVoiceStatus('Je t\'écoute…');
      setMood('surprised');
      const wav = await record();
      micBtn.classList.remove('recording');
      if (!wav) { setVoiceStatus(''); setMood(baseMood); talkLine('info', 'Je n\'ai rien entendu.'); return; }
      setVoiceStatus('Je transcris…');
      setMood('thinking');
      const text = await api.transcribe(wav);
      setVoiceStatus('');
      if (!text) { setMood(baseMood); talkLine('info', 'Je n\'ai pas compris, tu peux répéter ?'); return; }
      ask(text, { voice: true });
    } catch (err) {
      setVoiceStatus('');
      setMood('dizzy', 2000);
      talkLine('info', /Permission|NotAllowed|NotFound/i.test(String(err && err.name) + err)
        ? 'Je n\'ai pas accès au micro. Vérifie Paramètres Windows → Confidentialité → Microphone.'
        : `Le micro n'a pas marché : ${err.message || err}`);
    } finally {
      micBtn.classList.remove('busy', 'recording');
    }
  }
  micBtn.addEventListener('click', toggleMic);

  async function speakAloud(text) {
    if (!text.trim()) return;
    try {
      const wav = await api.speak(text);
      if (!wav) return;
      const url = URL.createObjectURL(new Blob([wav], { type: 'audio/wav' }));
      const audio = new Audio(url);
      voice.audio = audio;
      petEl.classList.add('speaking');
      const done = () => { petEl.classList.remove('speaking'); URL.revokeObjectURL(url); if (voice.audio === audio) voice.audio = null; };
      audio.addEventListener('ended', done);
      audio.addEventListener('pause', done);
      await audio.play();
    } catch (err) {
      petEl.classList.remove('speaking');
      talkLine('info', `Je n'arrive pas à parler : ${err.message || err}`);
    }
  }

  // Il fouille dans ses souvenirs : petite phrase d'attente en gris.
  function onChatStatus({ id, status }) {
    if (id !== chat.answering) return;
    chat.status = status;
    if (!chat.text.trim()) showAnswer();
  }

  // Ce qu'il avait commencé à écrire n'était qu'un « je regarde » : on efface.
  function onChatReset({ id }) {
    if (id !== chat.answering) return;
    chat.text = '';
    showAnswer();
  }

  function onChatError({ id, message, needsKey }) {
    if (id && id !== chat.answering) return;
    chat.answering = null;
    if (chat.line) {
      chat.line.className = 'info';
      chat.line.textContent = message || '';
      chat.line = null;
      if (needsKey) openAsk('key');
      return;
    }
    bubbleEl.classList.remove('chat');
    if (needsKey) openAsk('key');
    if (message) say(message, 6000);
  }

  // ------------------------------------------------------------------
  // Énergie : il fatigue quand ton quota Claude baisse (module quota)
  // ------------------------------------------------------------------

  let energyTimer = null;
  const dustEl = document.getElementById('dust');

  function dust() {
    for (const [left, dx] of [[20, -26], [40, -14], [130, 14], [150, 26]]) {
      const p = document.createElement('span');
      p.className = 'puff';
      p.style.left = `${left}px`;
      p.style.setProperty('--dx', `${dx}px`);
      dustEl.appendChild(p);
      setTimeout(() => p.remove(), 800);
    }
  }

  function setEnergy({ rest, tired, pose = '', instant }) {
    restMood = rest === 'sleepy' ? 'sleepy' : 'idle';
    document.body.classList.toggle('tired', Boolean(tired));
    const before = petEl.dataset.energy || '';
    if (baseMood !== 'sleeping') {
      const wasResting = mood === baseMood;
      baseMood = restMood;
      if (wasResting) setMood(baseMood);
    }
    if (pose === before) return;

    // pose : '' (debout), 'sit' (assis, quota bas) ou 'ko' (étalé, quota vide)
    clearTimeout(energyTimer);
    petEl.classList.remove('falling', 'dazed', 'landing', 'rising', 'getting-up');
    const apply = () => {
      petEl.dataset.energy = pose;
      document.body.classList.toggle('ko', pose === 'ko');
    };
    if (instant) { apply(); return; }

    if (pose === 'ko') {
      // il bascule en arrière...
      petEl.classList.add('falling', 'dazed');
      energyTimer = setTimeout(() => {
        // ...et se retrouve sur le dos : croix dans l'œil, petit rebond
        petEl.classList.remove('falling', 'dazed');
        apply();
        void petEl.offsetWidth;
        petEl.classList.add('landing');
        energyTimer = setTimeout(() => petEl.classList.remove('landing'), 450);
      }, 400);
    } else if (before === 'ko') {
      // il gigote sur le dos pour se retourner, puis se redresse
      petEl.classList.add('rising');
      energyTimer = setTimeout(() => {
        petEl.classList.remove('rising');
        apply();
        void petEl.offsetWidth;
        petEl.classList.add('getting-up');
        energyTimer = setTimeout(() => { petEl.classList.remove('getting-up'); play('hop'); }, 900);
      }, 700);
    } else if (pose === 'sit') {
      play('flop');
      energyTimer = setTimeout(apply, 600); // il s'assoit au moment où il s'écrase
    } else {
      apply();
      play('stretch');
    }
  }

  // ------------------------------------------------------------------
  // Activité (module activity) : accessoires, musique, discrétion
  // ------------------------------------------------------------------

  let quiet = false; // plein écran : pas de petites phrases spontanées

  // Lunettes quand tu codes, casque quand tu écoutes de la musique.
  function setGear(items = []) {
    const next = items.join(' ');
    if (next === (petEl.dataset.gear || '')) return;
    petEl.dataset.gear = next;
  }

  // Quelques notes qui s'envolent quand un nouveau morceau commence.
  function notes(count = 3) {
    if (baseMood === 'sleeping') return;
    for (let i = 0; i < count; i++) {
      setTimeout(() => {
        const n = document.createElement('span');
        n.className = 'heart note';
        n.textContent = pick(['♪', '♫']);
        n.style.left = `${rand(20, 150)}px`;
        n.style.top = `${rand(20, 70)}px`;
        heartsEl.appendChild(n);
        setTimeout(() => n.remove(), 1500);
      }, i * 350);
    }
  }

  // ------------------------------------------------------------------
  // Commandes des modules (processus principal)
  // ------------------------------------------------------------------

  // ------------------------------------------------------------------
  // Discussion : une petite bulle à côté de lui ; un clic l'agrandit en
  // fil de discussion (vos derniers échanges + une ligne pour écrire),
  // « – » la réduit. Elle reste comme tu l'as laissée.
  // ------------------------------------------------------------------

  function talkLine(kind, text) {
    const empty = talkLog.querySelector('.vide');
    if (empty) empty.remove();
    const p = document.createElement('p');
    p.className = kind;
    if (kind === 'moi') p.appendChild(document.createElement('span')).textContent = text;
    else p.textContent = text;
    talkLog.appendChild(p);
    while (talkLog.children.length > 80) talkLog.firstChild.remove();
    talkLog.scrollTop = talkLog.scrollHeight;
    return p;
  }

  async function loadHistory() {
    talk.loaded = true;
    let items = [];
    try { items = await api.chatHistory(); } catch { /* pas grave */ }
    if (talkLog.children.length) return; // on a déjà commencé à parler
    if (!items.length) {
      talkLog.appendChild(Object.assign(document.createElement('p'), { className: 'vide', textContent: 'Pas encore de discussion. Dis-moi quelque chose !' }));
      return;
    }
    for (const e of items) { talkLine('moi', e.moi); talkLine('lui', plain(e.toi)); }
  }

  function setTalk(open, { focus = true } = {}) {
    talk.open = open;
    document.body.classList.toggle('talking', open);
    talkEl.hidden = !open;
    try { localStorage.setItem('talkOpen', open ? '1' : '0'); } catch { /* pas grave */ }
    if (open) {
      talkToggle.classList.remove('unread');
      closeAsk();
      hideBubble();
      if (!talk.loaded) loadHistory();
      fitHeight(talkEl.offsetHeight);
      talkLog.scrollTop = talkLog.scrollHeight;
      setIgnore(false);
      if (focus) { api.focus(); talkInput.focus(); }
    } else {
      talkInput.blur();
      fitHeight(0);
    }
  }

  talkToggle.addEventListener('click', () => setTalk(true));
  document.getElementById('talk-close').addEventListener('click', () => setTalk(false));
  document.getElementById('talk-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const text = talkInput.value.trim();
    if (!text) return;
    talkInput.value = '';
    ask(text);
  });
  talkInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setTalk(false);
  });
  try { if (localStorage.getItem('talkOpen') === '1') setTimeout(() => setTalk(true, { focus: false }), 600); } catch { /* pas grave */ }

  api.onCommand((cmd) => {
    switch (cmd.type) {
      case 'say':
        // remarque spontanée : jamais pendant qu'on lui parle ni quand il dort
        if (cmd.ambient && (chat.open || chat.answering || baseMood === 'sleeping')) break;
        say(cmd.text, cmd.duration);
        break;
      case 'mood': setMood(cmd.mood, cmd.duration); break;
      case 'play': play(cmd.animation); break;
      case 'sleep': sleep(); break;
      case 'wake': wake(); break;
      case 'stage': setStage(cmd.stage); break;
      case 'evolve': evolve(cmd.stage, cmd.name); break;
      case 'ask-open': openAsk(cmd.mode); break;
      case 'energy': setEnergy(cmd); break;
      case 'chat-delta': onChatDelta(cmd); break;
      case 'chat-done': onChatDone(cmd); break;
      case 'chat-status': onChatStatus(cmd); break;
      case 'chat-reset': onChatReset(cmd); break;
      case 'chat-error': onChatError(cmd); break;
      case 'voice-status': setVoiceStatus(cmd.status); break;
      case 'gear': setGear(cmd.items); break;
      case 'groove': petEl.classList.toggle('grooving', Boolean(cmd.on)); break;
      case 'notes': notes(); break;
      case 'quiet': quiet = Boolean(cmd.on); break;
      default: console.warn('Commande inconnue', cmd);
    }
  });

  setMood('idle');
  scheduleBlink();
  idleBehaviour();
})();
