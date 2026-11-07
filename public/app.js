(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  // ---------- language ----------
  var LANG = 'en';
  try { LANG = localStorage.getItem('lang') || ''; } catch (e) {}
  if (!I18N[LANG]) {
    var nav = (navigator.language || '').slice(0, 2);
    LANG = I18N[nav] ? nav : 'en';
  }
  function t(key, vars) {
    var s = (I18N[LANG] && I18N[LANG][key]) || I18N.en[key] || key;
    if (vars) for (var k in vars) s = s.split('{' + k + '}').join(vars[k]);
    return s;
  }
  function applyLang() {
    document.documentElement.lang = LANG;
    $$('[data-i18n]').forEach(function (el) { el.textContent = t(el.getAttribute('data-i18n')); });
    $$('[data-i18n-ph]').forEach(function (el) { el.placeholder = t(el.getAttribute('data-i18n-ph')); });
    $$('[data-lang]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-lang') === LANG)); });
    document.dispatchEvent(new Event('langchange'));
  }
  $$('[data-lang]').forEach(function (b) {
    b.addEventListener('click', function () {
      LANG = b.getAttribute('data-lang');
      try { localStorage.setItem('lang', LANG); } catch (e) {}
      applyLang();
    });
  });

  // ---------- helpers ----------
  function api(path, body) {
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { ctrl && ctrl.abort(); }, 25000); // slow 3G friendly
    var opts = body
      ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
      : {};
    if (ctrl) opts.signal = ctrl.signal;
    return fetch(path, opts).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) {
        clearTimeout(timer);
        if (!r.ok) throw new Error(data.error || 'DEFAULT');
        return data;
      });
    }, function () { clearTimeout(timer); throw new Error('OFFLINE'); });
  }
  function errText(e) { var k = 'E_' + (e && e.message); return I18N.en[k] ? t(k) : t('E_DEFAULT'); }
  function showMsg(el, text, kind) { el.innerHTML = ''; if (!text) return; var d = document.createElement('div'); d.className = 'msg ' + (kind || 'err'); d.textContent = text; el.appendChild(d); }
  function busy(btn, on) { if (!btn) return; btn.disabled = on; if (on) { btn.dataset.label = btn.textContent; btn.textContent = t('loading'); } else if (btn.dataset.label) { btn.textContent = btn.dataset.label; } }
  function fmtDate(iso) {
    if (!iso) return '';
    var d = new Date(iso + 'T00:00:00');
    try { return d.toLocaleDateString(LANG === 'en' ? 'en-IN' : LANG + '-IN', { day: 'numeric', month: 'long', year: 'numeric' }); }
    catch (e) { return iso; }
  }
  function today() { var d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  // ---------- pages ----------
  var pages = {};

  pages.find = function () {
    var form = $('#search'), status = $('#status'), results = $('#results');
    var last = null, current = null, wanted = '';

    function render() {
      if (!last) return;
      results.innerHTML = '';
      if (!last.length) { showMsg(status, t('none')); return; }
      showMsg(status, t('results_n', { n: last.length }), 'ok');
      last.forEach(function (d) {
        var c = el('div', 'card donor');
        var top = el('div', 'donor-top');
        top.appendChild(el('div', 'bg' + (d.exact ? '' : ' compat'), d.blood_group));
        var info = el('div');
        info.appendChild(el('b', null, d.first_name));
        info.appendChild(el('div', 'mute', d.area));
        top.appendChild(info);
        c.appendChild(top);
        var tags = el('div', 'tags');
        tags.appendChild(el('span', 'tag', d.exact ? t('exact') : t('compatible', { group: wanted })));
        if (d.tier === 0) tags.appendChild(el('span', 'tag', t('same_pin')));
        else if (d.distance_km != null) tags.appendChild(el('span', 'tag', t('km', { n: d.distance_km })));
        else if (d.tier === 1) tags.appendChild(el('span', 'tag', t('same_district')));
        if (d.stale) tags.appendChild(el('span', 'tag stale', t('stale')));
        c.appendChild(tags);
        var b = el('button', 'btn wa', t('wa_btn'));
        b.type = 'button';
        b.addEventListener('click', function () { openContact(d); });
        c.appendChild(b);
        results.appendChild(c);
      });
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var place = $('#place').value.trim(), group = $('#group').value;
      if (place.length < 3 || !group) { showMsg(status, t(place.length < 3 ? 'E_BAD_PINCODE' : 'E_BAD_INPUT')); return; }
      var btn = $('button', form); busy(btn, true); results.innerHTML = ''; showMsg(status, '');
      api('/api/search?place=' + encodeURIComponent(place) + '&group=' + encodeURIComponent(group))
        .then(function (r) { wanted = group; last = r.donors; render(); results.scrollIntoView && status.scrollIntoView({ behavior: 'smooth' }); })
        .catch(function (err) { showMsg(status, errText(err)); })
        .then(function () { busy(btn, false); });
    });

    var overlay = $('#contact'), cform = $('#contactForm'), cerr = $('#contactErr');
    function openContact(d) {
      current = d;
      $('#contactTitle').textContent = t('contact_title', { name: d.first_name });
      showMsg(cerr, '');
      overlay.hidden = false;
      $('#hospital').focus();
    }
    function close() { overlay.hidden = true; current = null; }
    $('#cancel').addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !overlay.hidden) close(); });

    cform.addEventListener('submit', function (e) {
      e.preventDefault();
      var via = (e.submitter && e.submitter.value) || 'wa';
      var hospital = $('#hospital').value.trim();
      if (hospital.length < 3) { showMsg(cerr, t('E_NEED_HOSPITAL')); $('#hospital').focus(); return; }
      if (!$('#genuine').checked) { showMsg(cerr, t('need_genuine')); return; }
      var btn = e.submitter || $('button', cform); busy(btn, true);
      api('/api/contact', {
        donor_id: current.id, hospital: hospital, units: $('#units').value.trim(),
        from: $('#from').value.trim(), group: wanted, website: cform.website.value,
      }).then(function (r) {
        window.location.href = via === 'call' ? r.call : r.whatsapp;
        busy(btn, false);
      }).catch(function (err) {
        busy(btn, false);
        showMsg(cerr, errText(err));
        if (err.message === 'UNAVAILABLE') { last = last.filter(function (x) { return x !== current; }); render(); }
      });
    });

    document.addEventListener('langchange', render);
  };

  pages.register = function () {
    var form = $('#reg'), errBox = $('#regErr');
    $('#last_donated_on').max = today();
    var langRadio = $('input[name=lang][value=' + LANG + ']', form); if (langRadio) langRadio.checked = true;

    $$('input[name=sex]', form).forEach(function (r) {
      r.addEventListener('change', function () { $('#h4').hidden = form.sex.value !== 'F'; });
    });

    var pinInfo = $('#pinInfo'), lastPin = '';
    $('#pincode').addEventListener('input', function () {
      var p = this.value.replace(/\D/g, '').slice(0, 6);
      if (p !== this.value) this.value = p;
      if (p.length !== 6) { pinInfo.textContent = ''; $('#districtWrap').hidden = true; lastPin = ''; return; }
      if (p === lastPin) return; lastPin = p;
      api('/api/pincode?p=' + p).then(function (r) {
        if (r.found) { pinInfo.textContent = '✓ ' + r.district + ', ' + r.state; $('#districtWrap').hidden = true; }
        else { pinInfo.textContent = ''; $('#districtWrap').hidden = false; }
      }).catch(function () { $('#districtWrap').hidden = false; });
    });
    // On slow networks people may type before this script arrives.
    if ($('#pincode').value) $('#pincode').dispatchEvent(new Event('input'));
    if (form.sex.value === 'F') $('#h4').hidden = false;

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      showMsg(errBox, '');
      var f = form, sex = f.sex.value;
      var hq = $$('.hq', f).filter(function (c) { return !c.closest('[hidden]'); });
      var phone = f.phone.value.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '').replace(/^0(?=\d{10}$)/, '');
      var year = new Date().getFullYear(), by = parseInt(f.birth_year.value, 10), w = parseInt(f.weight_kg.value, 10);
      var problem =
        f.name.value.trim().length < 2 || !f.blood_group.value || !sex ? 'BAD_INPUT' :
        !/^[6-9]\d{9}$/.test(phone) ? 'BAD_PHONE' :
        !(year - by >= 18 && year - by <= 65) ? 'AGE' :
        !(w >= 45) ? 'WEIGHT' :
        !/^[1-9]\d{5}$/.test(f.pincode.value) ? 'BAD_PINCODE' :
        f.last_donated_on.value && f.last_donated_on.value > today() ? 'BAD_DATE' :
        !hq.every(function (c) { return c.checked; }) ? 'NOT_ELIGIBLE' :
        !$('#consent').checked ? 'NO_CONSENT' : '';
      if (problem) { showMsg(errBox, t('E_' + problem)); errBox.scrollIntoView({ block: 'center' }); return; }

      var btn = $('button:not([type])', f); busy(btn, true);
      api('/api/register', {
        name: f.name.value, phone: phone, blood_group: f.blood_group.value, sex: sex,
        birth_year: by, weight_kg: w, pincode: f.pincode.value, district: f.district.value,
        locality: f.locality.value, last_donated_on: f.last_donated_on.value,
        lang: f.lang.value || LANG, healthy: true, consent: true, website: f.website.value,
      }).then(function (r) {
        var url = location.origin + '/me#' + r.token;
        $('#link').textContent = url;
        $('#saveWa').href = 'https://wa.me/?text=' + encodeURIComponent(t('save_wa_text', { url: url }));
        var showNext = function () { $('#nextOn').textContent = r.next_eligible && r.next_eligible > today() ? t('next_on', { date: fmtDate(r.next_eligible) }) : ''; };
        showNext(); document.addEventListener('langchange', showNext);
        $('#regView').hidden = true; $('#doneView').hidden = false; window.scrollTo(0, 0);
        $('#copy').addEventListener('click', function () {
          var b = this;
          var done = function () { b.textContent = t('copied'); };
          if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, function () {});
          else { var r2 = document.createRange(); r2.selectNodeContents($('#link')); var s = getSelection(); s.removeAllRanges(); s.addRange(r2); try { document.execCommand('copy'); done(); } catch (x) {} }
        });
      }).catch(function (err) {
        busy(btn, false); showMsg(errBox, errText(err)); errBox.scrollIntoView({ block: 'center' });
      });
    });
  };

  pages.me = function () {
    var token = location.hash.replace(/^#/, ''), errBox = $('#meErr'), state = null;
    $('#otherDate').max = today();
    function render() {
      if (!state) return;
      $('#meName').textContent = state.first_name;
      $('#meGroup').textContent = state.blood_group;
      var s = $('#meStatus'), locked = state.next_eligible && state.next_eligible > today();
      s.className = 'msg ' + (state.available ? 'ok' : 'err');
      s.textContent = state.paused ? t('st_paused') : locked ? t('st_locked', { date: fmtDate(state.next_eligible) })
        : state.available ? t('st_avail', { group: state.blood_group }) : t('st_other');
      $('#bPause').hidden = state.paused; $('#bResume').hidden = !state.paused;
    }
    function act(action, date, btn) {
      busy(btn, true);
      return api('/api/manage', { token: token, action: action, date: date })
        .then(function (r) {
          busy(btn, false);
          if (r.deleted) { $('#meView').hidden = true; showMsg(errBox, t('deleted'), 'ok'); return; }
          state = r; $('#meView').hidden = false; showMsg(errBox, action === 'get' ? '' : t('saved'), 'ok'); render();
        })
        .catch(function (err) { busy(btn, false); showMsg(errBox, errText(err)); });
    }
    if (!/^[0-9a-f]{32}$/.test(token)) { showMsg(errBox, t('E_BAD_TOKEN')); return; }
    act('get');
    $$('[data-act]').forEach(function (b) {
      b.addEventListener('click', function () {
        var a = b.getAttribute('data-act');
        if (a === 'delete' && !window.confirm(t('confirm_delete'))) return;
        if (a === 'donated-date') { var d = $('#otherDate').value; if (!d) return; return act('donated', d, b); }
        act(a, a === 'donated' ? today() : null, b);
      });
    });
    document.addEventListener('langchange', render);
  };

  applyLang();
  var p = pages[document.body.getAttribute('data-page')];
  if (p) p();

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('/sw.js').catch(function () {});
  }
})();
