// Lê roteiro.txt e apresenta a história slide a slide, com efeito de máquina de escrever.
//
// Formato do roteiro:
//   ---            separa os slides
//   {a|b|c}        escreve "a", apaga, escreve "b"... o último fica na tela
//   [foto 03.jpg]  mostra a foto de m/fotos/ com fade
//   linha vazia    pausa curta
//   # comentário   linha ignorada

const VEL = { letra: 45, apaga: 30, antesDeApagar: 900, depoisDeApagar: 250, ponto: 350, virgula: 150, linha: 450, pausa: 700, foto: 600 };
const SEM_ANIMACAO = matchMedia('(prefers-reduced-motion: reduce)').matches;

const palco = document.getElementById('palco');
const slideEl = document.getElementById('slide');
const progresso = document.querySelector('#progresso span');

let slides = [];
let atual = 0;
let completo = false;
let geracao = 0; // muda a cada interrupção; animações de gerações antigas param sozinhas

const PAROU = Symbol('parou');

// ---------- Roteiro ----------

function parseLinha(linha) {
  const foto = linha.match(/^\[foto\s+(.+?)\]$/i);
  if (foto) return { tipo: 'foto', src: 'fotos/' + foto[1] };
  if (!linha) return { tipo: 'pausa' };
  // Divide em trechos fixos (string) e trocas {a|b} (array)
  const segs = [];
  linha.split(/(\{[^}]*\})/).forEach(p => {
    if (!p) return;
    segs.push(p.startsWith('{') && p.endsWith('}') ? p.slice(1, -1).split('|') : p);
  });
  return { tipo: 'texto', segs };
}

function parseRoteiro(txt) {
  return txt.replace(/\r/g, '').split(/^---\s*$/m)
    .map(bloco => bloco.split('\n')
      .filter(l => !l.trimStart().startsWith('#'))
      .map(l => l.trim()))
    .map(linhas => {
      while (linhas.length && !linhas[0]) linhas.shift();
      while (linhas.length && !linhas[linhas.length - 1]) linhas.pop();
      return linhas.map(parseLinha);
    })
    .filter(passos => passos.length);
}

// ---------- Animação ----------

function espera(ms, g) {
  return new Promise((ok, falha) => setTimeout(() => (g === geracao ? ok() : falha(PAROU)), ms));
}

const cursor = document.createElement('span');
cursor.className = 'cursor';
cursor.setAttribute('aria-hidden', 'true');

async function digita(alvo, texto, g) {
  const no = document.createTextNode('');
  alvo.appendChild(no);
  alvo.appendChild(cursor);
  for (const c of texto) {
    no.data += c;
    await espera(VEL.letra + ('.!?…'.includes(c) ? VEL.ponto : c === ',' ? VEL.virgula : 0), g);
  }
  return no;
}

async function apaga(no, g) {
  while (no.data.length) {
    no.data = [...no.data].slice(0, -1).join('');
    await espera(VEL.apaga, g);
  }
  no.remove();
}

function criaFoto(src) {
  const img = new Image();
  img.className = 'foto';
  img.alt = '';
  img.src = src;
  return img;
}

function fotoCarregada(img) {
  return img.complete ? Promise.resolve() : new Promise(ok => { img.onload = img.onerror = ok; setTimeout(ok, 4000); });
}

async function anima(passos, g) {
  for (const passo of passos) {
    if (passo.tipo === 'pausa') { await espera(VEL.pausa, g); continue; }

    if (passo.tipo === 'foto') {
      const img = criaFoto(passo.src);
      slideEl.appendChild(img);
      await fotoCarregada(img);
      if (g !== geracao) throw PAROU;
      requestAnimationFrame(() => img.classList.add('visivel'));
      await espera(VEL.foto, g);
      continue;
    }

    const p = document.createElement('p');
    p.className = 'linha';
    slideEl.appendChild(p);
    for (const seg of passo.segs) {
      if (typeof seg === 'string') { await digita(p, seg, g); continue; }
      const span = document.createElement('span');
      span.className = 'troca';
      p.appendChild(span);
      for (let i = 0; i < seg.length; i++) {
        const no = await digita(span, seg[i], g);
        if (i === seg.length - 1) break;
        await espera(VEL.antesDeApagar, g);
        await apaga(no, g);
        await espera(VEL.depoisDeApagar, g);
      }
    }
    await espera(VEL.linha, g);
  }
}

// Monta o slide já pronto, sem animação (para pular e para voltar)
function desenhaFinal(passos) {
  slideEl.classList.remove('saindo');
  slideEl.replaceChildren();
  for (const passo of passos) {
    if (passo.tipo === 'foto') {
      const img = criaFoto(passo.src);
      img.classList.add('visivel');
      slideEl.appendChild(img);
    } else if (passo.tipo === 'texto') {
      const p = document.createElement('p');
      p.className = 'linha';
      p.textContent = passo.segs.map(s => (typeof s === 'string' ? s : s[s.length - 1])).join('');
      slideEl.appendChild(p);
    }
  }
}

// ---------- Navegação ----------

function marcaCompleto() {
  cursor.remove();
  completo = true;
  palco.classList.add('completo');
  if (atual === slides.length - 1) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'para-japas';
    b.textContent = 'Pesquisa de japas em Madrid 😄';
    b.addEventListener('click', e => { e.stopPropagation(); abreJapas(); });
    slideEl.appendChild(b);
  }
}

function preCarrega(n) {
  (slides[n] || []).forEach(p => { if (p.tipo === 'foto') new Image().src = p.src; });
}

async function mostra(n, { animado = true } = {}) {
  const g = ++geracao;
  completo = false;
  palco.classList.remove('completo');
  atual = n;
  progresso.style.width = `${((n + 1) / slides.length) * 100}%`;
  preCarrega(n + 1);
  if (slideEl.childNodes.length && animado) {
    slideEl.classList.add('saindo');
    await new Promise(ok => setTimeout(ok, 350));
    if (g !== geracao) return; // tocou durante a transição: completaAgora já desenhou este slide
  }
  slideEl.classList.remove('saindo');
  slideEl.scrollTop = 0;

  if (!animado || SEM_ANIMACAO) { desenhaFinal(slides[n]); marcaCompleto(); return; }
  slideEl.replaceChildren();
  try {
    await anima(slides[n], g);
    marcaCompleto();
  } catch (e) {
    if (e !== PAROU) throw e;
  }
}

function completaAgora() {
  geracao++;
  desenhaFinal(slides[atual]);
  marcaCompleto();
}

function avanca() {
  if (!completo) completaAgora();
  else if (atual < slides.length - 1) mostra(atual + 1);
}

function volta() {
  if (atual > 0) mostra(atual - 1, { animado: false });
}

palco.addEventListener('click', e => {
  if (e.target.closest('button, a')) return;
  if (e.clientX < innerWidth / 3) volta(); else avanca();
});

document.addEventListener('keydown', e => {
  if (palco.hidden) return;
  if ([' ', 'Enter', 'ArrowRight'].includes(e.key)) { e.preventDefault(); avanca(); }
  if (e.key === 'ArrowLeft') { e.preventDefault(); volta(); }
});

function abreJapas() {
  geracao++;
  palco.hidden = true;
  document.body.classList.remove('modo-historia');
  document.getElementById('japas').hidden = false;
  scrollTo(0, 0);
  iniciaMapa(); // definida em index.html
}

document.getElementById('reiniciar').addEventListener('click', () => {
  document.getElementById('japas').hidden = true;
  document.body.classList.add('modo-historia');
  palco.hidden = false;
  slideEl.replaceChildren();
  mostra(0);
});

fetch('roteiro.txt')
  .then(r => r.text())
  .then(txt => {
    slides = parseRoteiro(txt);
    if (slides.length) mostra(0);
  });
