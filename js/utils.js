/* Small helpers shared by every part of the site. */
const Utils = (() => {
  function uid(prefix = 'id') {
    return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  // Every name, gamertag or note goes through esc() before it is put on the page.
  const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ESCAPES[ch]);
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function range(start, end) {
    if (end === undefined) { end = start; start = 0; }
    const out = [];
    for (let i = start; i < end; i++) out.push(i);
    return out;
  }

  function plural(n, one, many = one + 's') {
    return `${n} ${n === 1 ? one : many}`;
  }

  /* ---------- Dates ---------- */

  function pad(n) { return String(n).padStart(2, '0'); }

  // "2026-10-08" in local time (the format a date picker uses).
  function dayKey(value) {
    const d = new Date(value);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  function todayKey() { return dayKey(Date.now()); }

  // Turns a date picker value into a timestamp. Today uses the current time, so
  // matches entered today stay in the order they were played.
  function dateInputToISO(value, keepISO) {
    if (keepISO && dayKey(keepISO) === value) return keepISO;
    if (!value || value === todayKey()) return new Date().toISOString();
    const [y, m, d] = value.split('-').map(Number);
    if (!y || !m || !d) return new Date().toISOString();
    return new Date(y, m - 1, d, 12, 0, 0).toISOString();
  }

  const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
  const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const dayYearFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  const shortFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });

  function fmtTime(iso) { return iso ? timeFmt.format(new Date(iso)) : ''; }
  function fmtShortDate(iso) { return iso ? shortFmt.format(new Date(iso)) : ''; }
  function fmtDay(iso) {
    if (!iso) return '';
    const key = dayKey(iso);
    if (key === todayKey()) return 'Today';
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (key === dayKey(yesterday)) return 'Yesterday';
    const d = new Date(iso);
    return (d.getFullYear() === new Date().getFullYear() ? dayFmt : dayYearFmt).format(d);
  }
  function fmtDateTime(iso) { return iso ? `${fmtDay(iso)}, ${fmtTime(iso)}` : ''; }

  function timeAgo(iso) {
    if (!iso) return 'never';
    const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return plural(mins, 'minute') + ' ago';
    const hours = Math.round(mins / 60);
    if (hours < 24) return plural(hours, 'hour') + ' ago';
    return plural(Math.round(hours / 24), 'day') + ' ago';
  }

  function seasonName(date = new Date()) {
    const m = date.getMonth();
    const term = m >= 7 ? 'Fall' : m >= 5 ? 'Summer' : 'Spring';
    return `${term} ${date.getFullYear()}`;
  }

  /* ---------- Numbers and text ---------- */

  // +16 / −8 / ±0 (uses a real minus sign).
  function signed(n) {
    const r = Math.round(n);
    if (r > 0) return '+' + r;
    if (r < 0) return '−' + Math.abs(r);
    return '±0';
  }

  function pct(part, total) {
    return total ? Math.round((part / total) * 100) + '%' : '—';
  }

  function initials(text) {
    const words = String(text || '').trim().split(/\s+/).filter(Boolean);
    if (!words.length) return '?';
    if (words.length === 1) return Array.from(words[0]).slice(0, 2).join('').toUpperCase();
    return (Array.from(words[0])[0] + Array.from(words[1])[0]).toUpperCase();
  }

  // A steady color (0–359) for each player's avatar. FNV-1a spreads similar ids apart.
  function hue(text) {
    let h = 0x811c9dc5;
    for (const ch of String(text)) {
      h ^= ch.codePointAt(0);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h % 360;
  }

  /* ---------- Files ---------- */

  // Excel runs cells that start with = + - @ as formulas, so those get a leading apostrophe.
  function csvCell(value) {
    if (typeof value === 'number') return String(value);
    let s = String(value ?? '');
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function toCSV(rows) {
    return '﻿' + rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
  }

  function download(filename, text, type = 'text/plain') {
    const blob = new Blob([text], { type: type + ';charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  function readFile(file) {
    return file.text();
  }

  /* ---------- PIN ---------- */

  // Only keeps the PIN from sitting in storage as plain text. It is not strong security.
  function hashPin(pin) {
    const text = 'ssb-rankings:' + pin;
    let h = 0x811c9dc5;
    for (let round = 0; round < 2000; round++) {
      for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
      }
      h = (h ^ round) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
  }

  /* ---------- Randomness ---------- */

  // Seeded random numbers, so sample data comes out the same every time.
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(list, random = Math.random) {
    const out = list.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  return {
    uid, esc, clone, range, plural,
    pad, dayKey, todayKey, dateInputToISO, fmtTime, fmtShortDate, fmtDay, fmtDateTime, timeAgo, seasonName,
    signed, pct, initials, hue,
    toCSV, download, readFile,
    hashPin, rng, shuffle
  };
})();
