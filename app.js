// Painel do aluno (Ordoc). Lê a chave do próprio link (depois do #, que o navegador nunca manda ao servidor),
// baixa o envelope cifrado e decifra com a WebCrypto (AES-256-GCM). Tudo é escrito com textContent: nada do
// conteúdo vira HTML.
'use strict';
(function () {
  var DOMINIO = 'ordoc.portal-aluno.v1';
  var SITES = ['educacaoprofissional.educacao.sp.gov.br', 'saladofuturo.educacao.sp.gov.br', 'cmsp.ip.tv', 'sed.educacao.sp.gov.br'];
  var TIPOS = { registro_aula: 'Registro da aula', pause_responda: 'Pause e Responda', tarefa_sp: 'Tarefa SP', outro: 'Atividade' };
  var conteudo = document.getElementById('conteudo');
  var quem = document.getElementById('quem');

  function el(tag, cls, texto) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (texto !== undefined && texto !== null) e.textContent = texto;
    return e;
  }
  function hex(s) {
    var a = new Uint8Array(s.length / 2);
    for (var i = 0; i < a.length; i++) a[i] = parseInt(s.substr(i * 2, 2), 16);
    return a;
  }
  function num(x) { return x.toFixed(1).replace('.', ','); }
  function erro(titulo, texto) {
    quem.textContent = titulo;
    conteudo.textContent = '';
    var c = el('div', 'erro');
    c.appendChild(el('p', null, texto));
    conteudo.appendChild(c);
  }
  function linkSeguro(u) {
    try {
      var x = new URL(u);
      return x.protocol === 'https:' && SITES.indexOf(x.hostname) >= 0 && !x.username && !x.password && !x.port;
    } catch (e) { return false; }
  }

  function desenhar(p) {
    quem.textContent = 'Olá, ' + p.primeiro_nome + '!';
    quem.appendChild(el('small', null, p.turma + ' · atualizado em ' + p.atualizado_em));
    conteudo.textContent = '';
    var r = el('div', 'resumo');
    [['verde', p.verdes, 'feitas'], ['amarela', p.amarelos, 'para reenviar'], ['vermelha', p.vermelhos, 'por fazer']].forEach(function (c) {
      var d = el('div', 'chip ' + c[0]);
      d.appendChild(el('b', null, String(c[1])));
      d.appendChild(el('span', null, c[2]));
      r.appendChild(d);
    });
    conteudo.appendChild(r);
    if (p.avisos && p.avisos.length) {
      var av = el('section', 'avisos');
      av.appendChild(el('h2', null, 'O que fazer primeiro'));
      var ul = el('ul');
      p.avisos.forEach(function (a) { ul.appendChild(el('li', null, a)); });
      av.appendChild(ul);
      conteudo.appendChild(av);
    }
    p.materias.forEach(function (m) {
      var d = el('details', 'materia');
      d.open = m.vermelhos + m.amarelos > 0;
      var s = el('summary');
      s.appendChild(el('h2', null, m.nome));
      s.appendChild(el('span', 'contagem', m.verdes + ' feitas · ' + m.amarelos + ' para reenviar · ' + m.vermelhos + ' por fazer'));
      d.appendChild(s);
      var md = el('div', 'medias');
      if (m.media_avaliadas !== null && m.media_avaliadas !== undefined) {
        var a = el('span', 'media', 'Média das já avaliadas: ');
        a.appendChild(el('b', null, num(m.media_avaliadas)));
        md.appendChild(a);
      }
      if (m.media_estimada !== null && m.media_estimada !== undefined) {
        var b = el('span', 'media', 'Estimativa contando o que falta: ');
        b.appendChild(el('b', null, num(m.media_estimada)));
        md.appendChild(b);
      }
      if (md.childNodes.length) d.appendChild(md);
      if (m.faltas) d.appendChild(el('div', 'faltas ' + m.faltas.bandeira, 'Faltas: ' + m.faltas.texto));
      m.itens.forEach(function (i) {
        var it = el('div', 'item');
        it.appendChild(el('span', 'b ' + i.bandeira));
        var t = el('div', 'tit');
        if (i.codigo) t.appendChild(el('span', 'cod', i.codigo));
        t.appendChild(document.createTextNode(i.titulo));
        t.appendChild(el('div', 'tipo', TIPOS[i.tipo] || ''));
        it.appendChild(t);
        it.appendChild(el('div', 'sit', i.situacao));
        if (i.nota) {
          var n = el('div', 'nota', 'Nota: ');
          n.appendChild(el('b', null, i.nota));
          it.appendChild(n);
        }
        if (i.avaliacao) it.appendChild(el('div', 'aval', 'Avaliação do professor: ' + i.avaliacao));
        if (i.link && linkSeguro(i.link)) {
          var l = el('a', null, 'Abrir na plataforma');
          l.href = i.link;
          l.rel = 'noopener noreferrer';
          l.target = '_blank';
          it.appendChild(l);
        }
        d.appendChild(it);
      });
      conteudo.appendChild(d);
    });
  }

  async function abrir() {
    var h = location.hash.slice(1).split('.');
    if (h.length !== 2 || !/^[0-9a-f]{32}$/.test(h[0]) || !/^[0-9a-f]{64}$/.test(h[1])) {
      return erro('Link incompleto', 'Abra o link inteiro que o professor mandou (ele termina com um código longo depois do #).');
    }
    if (!window.crypto || !crypto.subtle) {
      return erro('Navegador sem suporte', 'Abra o link no Chrome, no Edge ou no navegador do celular atualizado.');
    }
    var r;
    try { r = await fetch('d/' + h[0] + '.json', { cache: 'no-store' }); } catch (e) { r = null; }
    if (!r || !r.ok) return erro('Painel não encontrado', 'Este link é antigo ou foi trocado. Peça o link novo ao professor.');
    try {
      var env = await r.json();
      var chave = await crypto.subtle.importKey('raw', hex(h[1]), 'AES-GCM', false, ['decrypt']);
      var claro = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: hex(env.n), additionalData: new TextEncoder().encode(DOMINIO + '|' + h[0]) },
        chave, hex(env.c));
      desenhar(JSON.parse(new TextDecoder().decode(claro)));
    } catch (e) {
      erro('Link inválido', 'Não foi possível abrir este painel. Confira se o link está inteiro ou peça um novo ao professor.');
    }
  }
  abrir();
})();
