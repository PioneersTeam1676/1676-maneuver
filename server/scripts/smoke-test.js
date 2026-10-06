#!/usr/bin/env node
// End-to-end smoke test of a RUNNING API against a TEST database.
// It creates and deletes scouting/pit entries and roles, so never point it at
// production data.
//
//   SMOKE_API=http://localhost:4000/api //   SMOKE_ADMIN=boss@yourdomain.org SMOKE_DOMAIN=yourdomain.org //   AUTH_JWT_SECRET=<same secret as the server> node scripts/smoke-test.js
//
// (or AUTH_JWT_SECRET_FILE=server/data/.auth-jwt-secret). The server must have
// SMOKE_ADMIN in VITE_GOOGLE_ADMIN_EMAIL and SMOKE_DOMAIN as the allowed domain.
const path = require('path')
const { signAppToken, signRefreshToken } = require(path.join(__dirname, '../src/utils/appJwt'))
const B = process.env.SMOKE_API || 'http://localhost:4000/api'
const ADMIN = process.env.SMOKE_ADMIN || 'boss@pascack.org'
const DOMAIN = process.env.SMOKE_DOMAIN || 'pascack.org'
const OUTSIDER = `smoke-outsider-${Date.now()}@example.com`
const tok = (email) => signAppToken({ email, name: email.split('@')[0] }).token
const call = async (method, path, email, body, raw) => {
  const headers = { 'Content-Type': 'application/json' }
  if (email) headers.Authorization = `Bearer ${raw ? email : tok(email)}`
  const r = await fetch(B + path, { method, headers, body: body ? JSON.stringify(body) : undefined })
  let j; try { j = await r.json() } catch { j = null }
  return [r.status, j]
}
const check = (label, cond, extra) => { console.log(`${cond ? 'PASS' : 'FAIL'} ${label}${cond ? '' : ' ' + JSON.stringify(extra)}`); if (!cond) process.exitCode = 1 }
;(async () => {
  let r
  r = await call('GET', '/roles/me', ADMIN); check('configured admin is tech_lead', r[1]?.role === 'tech_lead', r)
  r = await call('GET', '/roles/me', `kid@${DOMAIN}`); check('domain user defaults to scout', r[1]?.role === 'scout', r)
  r = await call('GET', '/roles/me', OUTSIDER); check('outsider is pending', r[1]?.role === 'pending', r)
  r = await call('PUT', `/recent-users/${OUTSIDER}`, OUTSIDER, { firstName: 'Fr', lastName: 'Iend', teamNumber: '1234', displayName: 'Fr Iend' })
  check('outsider can submit verification request', r[0] === 200, r)
  r = await call('GET', '/recent-users', ADMIN); check('lead sees pending request', r[1]?.recentUsers?.some((u) => u.email === OUTSIDER && !u.acknowledged), r)
  r = await call('GET', '/scouting', OUTSIDER); check('pending outsider blocked from data', r[0] === 403, r)
  r = await call('PUT', `/roles/${OUTSIDER}`, `kid@${DOMAIN}`, { role: 'scout' }); check('scout cannot approve', r[0] === 403, r)
  r = await call('PUT', `/roles/${OUTSIDER}`, ADMIN, { role: 'scout' }); check('admin approves outsider', r[0] === 200, r)
  r = await call('GET', '/roles/me', OUTSIDER); check('approved outsider is scout', r[1]?.role === 'scout', r)
  r = await call('GET', '/scouting', OUTSIDER); check('approved outsider can read', r[0] === 200, r)
  r = await call('PUT', `/roles/${ADMIN}`, ADMIN, { role: 'scout' }); check('configured admin cannot be demoted', r[0] === 409, r)

  // uploads
  const entry = (id, team, match, extra = {}) => ({ id, teamNumber: team, matchNumber: match, alliance: 'red', scoutName: 'Kid', eventName: '2026njfla', timestamp: Date.now(), data: { selectTeam: team, matchNumber: match, eventName: '2026njfla', scoutName: 'Kid', customFieldNextYear: 42, notes: 'hi', ...extra } })
  r = await call('POST', '/scouting', `kid@${DOMAIN}`, { entry: entry('e1', '1676', '1') }); check('single upload', r[0] === 201, r)
  const many = Array.from({ length: 30 }, (_, i) => entry(`b${i}`, String(100 + i), String(i + 2)))
  const results = await Promise.all(many.map((e) => call('POST', '/scouting', `newkid-${Date.now()}@${DOMAIN}`, { entry: e })))
  check('30 parallel uploads from a first-time scout all succeed', results.every((x) => x[0] === 201), results.filter((x) => x[0] !== 201).slice(0, 2))
  r = await call('POST', '/scouting/bulk', `kid@${DOMAIN}`, { entries: [entry('e1', '1676', '1', { notes: 'edited' }), entry('e2', '254', '1')] }); check('bulk upsert', r[0] === 201, r)
  r = await call('GET', '/scouting', `kid@${DOMAIN}`)
  const e1 = r[1]?.entries?.find((e) => e.clientId === 'e1')
  check('no duplicates after re-upload', r[1]?.entries?.filter((e) => e.clientId === 'e1').length === 1, r[1]?.entries?.length)
  check('server keeps custom form fields', e1?.data?.customFieldNextYear === 42, e1?.data)
  check('server keeps rebuilt export columns', e1?.data?.['Team Number'] === '1676', e1?.data)
  check('edit applied', e1?.data?.notes === 'edited' || e1?.data?.Notes === 'edited', e1?.data)
  r = await call('DELETE', '/scouting/b0', `kid@${DOMAIN}`); check("scout can't delete another scout's entry", r[0] === 403, r)
  r = await call('DELETE', '/scouting/e2', `kid@${DOMAIN}`); check('scout can delete own entry', r[0] === 200 && r[1]?.success, r)
  r = await call('DELETE', '/scouting/b0', ADMIN); check('lead can delete any entry', r[0] === 200 && r[1]?.success, r)
  r = await call('DELETE', '/scouting', `kid@${DOMAIN}`); check('scout cannot wipe all', r[0] === 403, r)

  // pit with photo
  const photo = 'data:image/jpeg;base64,' + Buffer.alloc(3 * 1024 * 1024, 7).toString('base64')
  r = await call('POST', '/pit/bulk', `kid@${DOMAIN}`, { entries: [{ id: 'p1', teamNumber: '1676', eventName: '2026njfla', scoutName: 'Kid', timestamp: Date.now(), data: { photo, photo2: photo } }] })
  check('pit entry with two ~4MB photos uploads', r[0] === 201, r)

  // config endpoints
  r = await call('PUT', '/forms/active', `kid@${DOMAIN}`, { match: 'x' }); check('scout cannot change active form', r[0] === 403, r)
  r = await call('POST', '/schedule/assignments', `kid@${DOMAIN}`, { eventKey: '2026njfla', assignments: [] }); check('scout cannot replace schedule', r[0] === 403, r)
  r = await call('POST', '/push/notify', `kid@${DOMAIN}`, { email: 'a@b.c', body: 'x' }); check('scout cannot send push', r[0] === 403, r)
  r = await call('POST', '/webhook-sync/start', `kid@${DOMAIN}`, {}); check('scout cannot start webhook sync', r[0] === 403, r)

  // backups
  r = await call('POST', '/backups', ADMIN, {}); check('lead takes server snapshot', r[0] === 201, r)
  r = await call('GET', '/backups', ADMIN); check('lead lists snapshots', r[1]?.backups?.length >= 1, r)
  r = await call('GET', '/backups', `kid@${DOMAIN}`); check('scout cannot list snapshots', r[0] === 403, r)
  r = await call('GET', '/scouting/export/raw?format=csv', ADMIN); check('raw export works', r[0] === 200, r)

  // session refresh
  const refresh = signRefreshToken({ email: `kid@${DOMAIN}`, name: 'Kid' })
  const rr = await fetch(B + '/auth/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: refresh }) })
  const rj = await rr.json()
  check('refresh issues new access token', rr.status === 200 && rj.accessToken, rj)
  r = await call('GET', '/roles/me', rj.accessToken, null, true); check('refreshed token works', r[1]?.role === 'scout', r)
  console.log(process.exitCode ? 'SMOKE TEST FAILED' : 'ALL CHECKS PASSED')
})()
