import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { supabase } from './supabase';
import './style.css';

const blank = { name: '', dosage: '', reminder_time: '09:00', patient_id: '' };
const localDay = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const shortTime = (t) => { if (!t) return '—'; const [h,m] = t.slice(0,5).split(':').map(Number); return new Date(2000,0,1,h,m).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}); };
const niceDate = (value) => { if (!value) return 'Not recorded'; const d = new Date(value); return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('en-US',{dateStyle:'medium',timeStyle:'short'}); };
const niceSchedule = (value) => { if (!value) return '—'; const d = new Date(value.includes('T') ? value : value.replace(' ','T')); return Number.isNaN(d.getTime()) ? value : d.toLocaleString('en-US',{dateStyle:'medium',timeStyle:'short'}); };

function App() {
  const [session,setSession] = useState(null);
  const [profile,setProfile] = useState(null);
  const [meds,setMeds] = useState([]);
  const [logs,setLogs] = useState([]);
  const [patients,setPatients] = useState([]);
  const [email,setEmail] = useState('');
  const [password,setPassword] = useState('');
  const [showPassword,setShowPassword] = useState(false);
  const [msg,setMsg] = useState('');
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState(false);
  const [form,setForm] = useState(blank);
  const [editing,setEditing] = useState(null);
  const [page,setPage] = useState('dashboard');
  const [search,setSearch] = useState('');
  const [patientFilter,setPatientFilter] = useState('all');
  const [showInactive,setShowInactive] = useState(false);
  const [refreshing,setRefreshing] = useState(false);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({data,error}) => {
      if (!mounted) return;
      if (error) setMsg(error.message);
      setSession(data?.session || null);
      setLoading(false);
    }).catch(e => { if(mounted){setMsg(e.message);setLoading(false);} });
    const {data:{subscription}} = supabase.auth.onAuthStateChange((_event,s) => setSession(s));
    return () => { mounted = false; subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!session) { setProfile(null);setMeds([]);setLogs([]);setPatients([]);return; }
    let live = true;
    setProfile(null);
    (async () => {
      const {data,error} = await supabase.from('profiles').select('id,display_name,role').eq('id',session.user.id).single();
      if(live){setProfile(data || null);if(error)setMsg(error.message);}
    })().catch(e => {if(live)setMsg(e.message);});
    return () => {live=false;};
  }, [session?.user?.id]);

  async function refresh(currentProfile = profile) {
    if (!currentProfile) return;
    setRefreshing(true);
    try {
      const caregiver = currentProfile.role === 'caregiver';
      const [m,l,p] = await Promise.all([
        supabase.from('medications').select('*').order('reminder_time'),
        supabase.from('dose_logs').select('*').order('scheduled_for',{ascending:false}).limit(300),
        caregiver ? supabase.from('caregiver_patients').select('patient_id,profiles!caregiver_patients_patient_id_fkey(display_name)') : Promise.resolve({data:[],error:null})
      ]);
      if(m.error || l.error || p.error) setMsg(m.error?.message || l.error?.message || p.error?.message);
      if(!m.error)setMeds(m.data || []);
      if(!l.error)setLogs(l.data || []);
      if(!p.error)setPatients(p.data || []);
    } catch(e) {setMsg(e.message);} finally {setRefreshing(false);}
  }
  useEffect(() => {if(profile)refresh(profile);},[profile]);

  async function signIn(e) {
    e.preventDefault();setBusy(true);setMsg('');
    try {const {error} = await supabase.auth.signInWithPassword({email,password});if(error)setMsg(error.message);}
    catch(e){setMsg(e.message);} finally{setBusy(false);}
  }
  async function signOut() {const {error}=await supabase.auth.signOut();if(error)setMsg(error.message);else{setPage('dashboard');setPassword('');}}
  async function saveMed(e) {
    e.preventDefault();setBusy(true);setMsg('');
    try {
      const payload={name:form.name.trim(),dosage:form.dosage.trim(),reminder_time:form.reminder_time.slice(0,5)+':00'};
      const result=editing ? await supabase.from('medications').update(payload).eq('id',editing) : await supabase.from('medications').insert({...payload,patient_id:form.patient_id});
      if(result.error) setMsg(result.error.message);
      else {setEditing(null);setForm({...blank});await refresh();setPage('medications');}
    } catch(e){setMsg(e.message);}finally{setBusy(false);}
  }
  async function deactivate(m) {
    if(!window.confirm(`Deactivate ${m.name}?`))return;
    setBusy(true);setMsg('');
    try {const {error}=await supabase.from('medications').update({active:false}).eq('id',m.id);if(error)setMsg(error.message);else await refresh();}
    catch(e){setMsg(e.message);}finally{setBusy(false);}
  }
  async function confirm(m) {
    if(!window.confirm(`Confirm you took ${m.name}?`))return;
    setBusy(true);setMsg('');
    try {
      const {error}=await supabase.from('dose_logs').insert({medication_id:m.id,patient_id:session.user.id,scheduled_for:`${localDay()}T${m.reminder_time}`,status:'patient_reported_taken'});
      if(error)setMsg(error.message);else await refresh();
    } catch(e){setMsg(e.message);}finally{setBusy(false);}
  }
  function startEdit(m){setEditing(m.id);setForm({name:m.name,dosage:m.dosage,reminder_time:m.reminder_time,patient_id:m.patient_id});setPage('manage');window.scrollTo({top:0,behavior:'smooth'});}
  const caregiver=profile?.role==='caregiver';
  const today=localDay();
  const visibleMeds=useMemo(() => meds.filter(m => !caregiver || patientFilter==='all' || m.patient_id===patientFilter),[meds,caregiver,patientFilter]);
  const visibleLogs=useMemo(() => logs.filter(l => !caregiver || patientFilter==='all' || l.patient_id===patientFilter),[logs,caregiver,patientFilter]);
  const todayLogs=visibleLogs.filter(l=>l.scheduled_for?.slice(0,10)===today);
  const active=visibleMeds.filter(m=>m.active);
  const confirmedIds=new Set(todayLogs.filter(l=>l.status==='patient_reported_taken').map(l=>l.medication_id));
  const confirmed=active.filter(m=>confirmedIds.has(m.id)).length;
  const pending=active.length-confirmed;
  const progress=active.length ? Math.round(confirmed/active.length*100) : 0;
  const displayed=visibleMeds.filter(m=>(showInactive || m.active) && `${m.name} ${m.dosage}`.toLowerCase().includes(search.toLowerCase()));
  const nameForPatient=id=>patients.find(p=>p.patient_id===id)?.profiles?.display_name || 'Patient';

  if(loading || (session && !profile && !msg))return <div className="loading-screen"><div className="spinner"/><p>Loading Medication Reminder...</p></div>;
  if(!session)return <main className="auth-page"><div className="auth-layout">
    <section className="auth-intro"><div className="brand"><span className="brand-icon">✚</span><span>Medication Reminder</span></div><div className="intro-content"><span className="eyebrow">SMART MEDICATION MANAGEMENT</span><h1>Better care.<br/>Better reminders.<br/><em>Peace of mind.</em></h1><p>A smarter way for patients and caregivers to stay connected, manage medications, and support everyday wellness.</p><div className="features"><div><span>✓</span><p><strong>Medication tracking</strong><small>Organize schedules and record doses.</small></p></div><div><span>♡</span><p><strong>Caregiver connection</strong><small>Support loved ones with shared care.</small></p></div><div><span>◷</span><p><strong>Reminder support</strong><small>Stay informed about scheduled doses.</small></p></div></div></div><small>Designed to make medication management simpler.</small></section>
    <section className="auth-right"><div className="auth-card"><span className="auth-heart">♡</span><h2>Welcome back</h2><p>Sign in to your patient or caregiver account.</p><form onSubmit={signIn}><label htmlFor="email">Email address</label><input id="email" type="email" autoComplete="email" placeholder="Enter your email" value={email} onChange={e=>setEmail(e.target.value)} required/><label htmlFor="password">Password</label><div className="password-wrap"><input id="password" type={showPassword?'text':'password'} autoComplete="current-password" placeholder="Enter your password" value={password} onChange={e=>setPassword(e.target.value)} required/><button type="button" onClick={()=>setShowPassword(!showPassword)}>{showPassword?'Hide':'Show'}</button></div>{msg&&<p className="error" role="alert">{msg}</p>}<button className="primary login-button" disabled={busy}>{busy?'Signing in...':'Sign in  →'}</button></form><p className="security">◇ Secure account sign-in</p><small>Prototype application — use test records only.</small></div></section>
  </div></main>;
  if(!profile)return <main className="setup-card"><h2>Account setup required</h2><p>An administrator must create your profile and authorize your patient or caregiver relationship.</p>{msg&&<p className="error">{msg}</p>}<button className="primary" onClick={signOut}>Sign out</button></main>;

  const nav=[['dashboard','▦','Overview'],['medications','◷','Medications'],['history','▤','Dose history'],...(caregiver?[['manage','＋','Manage medications']]:[])];
  return <div className="app-shell">
    <aside className="sidebar"><div className="sidebar-brand"><span className="sidebar-logo">✚</span><span>Medication<br/>Reminder</span></div><div className="sidebar-label">WORKSPACE</div><nav aria-label="Main navigation">{nav.map(([id,ico,label])=><button key={id} className={`nav-link ${page===id?'selected':''}`} onClick={()=>setPage(id)}><span>{ico}</span>{label}</button>)}</nav><div className="sidebar-bottom"><div className="account-box"><div className="avatar">{(profile.display_name||'U').charAt(0).toUpperCase()}</div><div><strong>{profile.display_name||'User'}</strong><small>{caregiver?'Caregiver':'Patient'} account</small></div></div><button className="nav-link logout" onClick={signOut}><span>↪</span>Sign out</button></div></aside>
    <div className="workspace"><header className="topbar"><div className="mobile-brand">✚ Medication Reminder</div><div className="topbar-date">{new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'})}</div><div className="topbar-right"><span className="role-chip">{caregiver?'♡ Caregiver':'♡ Patient'}</span><button className="refresh-button" onClick={()=>refresh()} disabled={refreshing}>{refreshing?'Refreshing...':'↻ Refresh'}</button></div></header><main className="content">
      {msg&&<div className="error" role="alert">{msg}<button aria-label="Dismiss error" onClick={()=>setMsg('')}>×</button></div>}
      {caregiver&&patients.length>0&&<div className="patient-picker"><label htmlFor="patientFilter">Viewing patient</label><select id="patientFilter" value={patientFilter} onChange={e=>setPatientFilter(e.target.value)}><option value="all">All linked patients</option>{patients.map(p=><option key={p.patient_id} value={p.patient_id}>{p.profiles?.display_name||p.patient_id}</option>)}</select></div>}
      {page==='dashboard'&&<>
        <section className="welcome-banner"><div><span className="banner-kicker">YOUR CARE AT A GLANCE</span><h1>{caregiver?'Care starts with staying connected.':'Good to see you, '+(profile.display_name||'there')+'!'}</h1><p>{caregiver?'Review medication schedules and patient-reported confirmations.':'Stay on top of your medication schedule, one step at a time.'}</p></div><div className="banner-art" aria-hidden="true">♡<span>✚</span></div></section>
        <div className="section-title"><h2>Today's overview</h2><span>{new Date().toLocaleDateString('en-US',{month:'long',day:'numeric'})}</span></div>
        <section className="stat-grid"><div className="stat-card"><span className="stat-icon teal">▤</span><span>Active medications</span><strong>{active.length}</strong><small>Currently on schedule</small></div><div className="stat-card"><span className="stat-icon green">✓</span><span>Confirmed today</span><strong>{confirmed}</strong><small>Patient-reported doses</small></div><div className="stat-card"><span className="stat-icon amber">◷</span><span>Awaiting confirmation</span><strong>{pending}</strong><small>Not necessarily missed</small></div></section>
        <section className="surface progress-card"><div className="progress-top"><div><h2>Today's progress</h2><p>{confirmed} of {active.length} active medications confirmed</p></div><strong>{progress}%</strong></div><div className="progress-track" role="progressbar" aria-valuenow={progress} aria-valuemin="0" aria-valuemax="100"><div style={{width:`${progress}%`}}/></div><p className="subtle">Confirmations are self-reported and do not independently verify medication intake.</p></section>
        <div className="section-title"><h2>{caregiver?'Medication overview':'Your medications'}</h2><button className="text-action" onClick={()=>setPage('medications')}>View all →</button></div>
        <div className="med-grid">{active.length?active.slice(0,4).map(m=>medCard(m)): <div className="surface empty">No active medications available.</div>}</div>
        <section className="surface recent"><div className="section-title"><h2>Recent activity</h2><button className="text-action" onClick={()=>setPage('history')}>Full history →</button></div>{visibleLogs.length?<div className="activity-list">{visibleLogs.slice(0,4).map(l=><div key={l.id} className="activity-item"><span className="activity-dot">✓</span><div><strong>{meds.find(m=>m.id===l.medication_id)?.name||'Medication'}</strong><small>{l.status.replaceAll('_',' ')} · {niceSchedule(l.scheduled_for)}</small></div><span className="activity-status">{l.status==='patient_reported_taken'?'Reported':'Logged'}</span></div>)}</div>:<p className="subtle">No dose activity recorded yet.</p>}</section>
      </>}
      {page==='medications'&&<><div className="page-heading"><div><span className="eyebrow dark">MEDICATION SCHEDULE</span><h1>{caregiver?'Managed medications':'My medications'}</h1><p>Review scheduled doses and patient-reported status.</p></div>{caregiver&&<button className="primary" onClick={()=>{setEditing(null);setForm({...blank});setPage('manage');}}>+ Add medication</button>}</div><div className="toolbar"><input aria-label="Search medications" placeholder="Search medications..." value={search} onChange={e=>setSearch(e.target.value)}/><label className="toggle"><input type="checkbox" checked={showInactive} onChange={e=>setShowInactive(e.target.checked)}/> Show inactive</label></div><div className="med-grid">{displayed.length?displayed.map(m=>medCard(m)):<div className="surface empty">No medications match your filters.</div>}</div></>}
      {page==='history'&&<><div className="page-heading"><div><span className="eyebrow dark">MEDICATION RECORDS</span><h1>Dose history</h1><p>Review recorded dose events and confirmations.</p></div></div><section className="surface history-surface"><div className="table-scroll"><table><thead><tr><th>Scheduled for</th><th>Medication</th>{caregiver&&<th>Patient</th>}<th>Status</th><th>Reported taken at</th></tr></thead><tbody>{visibleLogs.slice(0,100).map(l=><tr key={l.id}><td>{niceSchedule(l.scheduled_for)}</td><td><strong>{meds.find(m=>m.id===l.medication_id)?.name||'Medication'}</strong></td>{caregiver&&<td>{nameForPatient(l.patient_id)}</td>}<td><span className="status-badge reported">{l.status.replaceAll('_',' ')}</span></td><td>{niceDate(l.confirmed_at)}</td></tr>)}</tbody></table></div>{!visibleLogs.length&&<p className="empty">No dose history recorded yet.</p>}</section></>}
      {page==='manage'&&caregiver&&<><div className="page-heading"><div><span className="eyebrow dark">CAREGIVER TOOLS</span><h1>{editing?'Edit medication':'Add medication'}</h1><p>Manage medications for linked patients.</p></div></div><section className="surface manage-card"><form className="manage-form" onSubmit={saveMed}>{!editing&&<label>Patient<select value={form.patient_id} onChange={e=>setForm({...form,patient_id:e.target.value})} required><option value="">Choose patient</option>{patients.map(p=><option key={p.patient_id} value={p.patient_id}>{p.profiles?.display_name||p.patient_id}</option>)}</select></label>}<label>Medication name<input maxLength="120" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="e.g. Test Vitamin D" required/></label><label>Prescribed dose (text)<input maxLength="120" value={form.dosage} onChange={e=>setForm({...form,dosage:e.target.value})} placeholder="e.g. One tablet" required/></label><label>Reminder time<input type="time" value={form.reminder_time.slice(0,5)} onChange={e=>setForm({...form,reminder_time:e.target.value})} required/></label><div className="form-actions"><button className="primary" disabled={busy}>{busy?'Saving...':editing?'Save changes':'Add medication'}</button><button type="button" className="outline" onClick={()=>{setEditing(null);setForm({...blank});setPage('medications');}}>Cancel</button></div></form><p className="subtle">This prototype stores a reminder time, but does not automatically send reminders. Verify all medication details before saving.</p></section></>}
      <footer className="app-footer">Medication Reminder · Prototype only · Use test records · No automatic calls or escalations enabled</footer>
    </main></div>
    <nav className="mobile-nav" aria-label="Mobile navigation">{nav.map(([id,ico,label])=><button key={id} className={page===id?'selected':''} onClick={()=>setPage(id)}><span>{ico}</span><small>{label}</small></button>)}<button onClick={signOut}><span>↪</span><small>Sign out</small></button></nav>
  </div>;

  function medCard(m) {
    const reported=todayLogs.find(l=>l.medication_id===m.id && l.status==='patient_reported_taken');
    return <article className="med-card" key={m.id}><div className="med-card-top"><span className="med-symbol">✚</span><span className={`status-badge ${!m.active?'inactive':reported?'reported':'waiting'}`}>{!m.active?'Inactive':reported?'Confirmed':'Awaiting confirmation'}</span></div><h3>{m.name}</h3><p className="dose-text">{m.dosage}</p>{caregiver&&<p className="patient-caption">Patient: {nameForPatient(m.patient_id)}</p>}<div className="med-time"><span>◷</span><div><small>Scheduled reminder</small><strong>{shortTime(m.reminder_time)}</strong></div></div>{reported&&<p className="confirmed-caption">✓ Reported taken: {niceDate(reported.confirmed_at)}</p>}<div className="med-actions">{caregiver?<><button className="outline" onClick={()=>startEdit(m)}>Edit medication</button>{m.active&&<button className="danger" disabled={busy} onClick={()=>deactivate(m)}>Deactivate</button>}</>:m.active&&<button className="primary" disabled={busy||Boolean(reported)} onClick={()=>confirm(m)}>{reported?'✓ Confirmed today':'✓ I took this medication'}</button>}</div></article>;
  }
}

createRoot(document.getElementById('root')).render(<App/>);
