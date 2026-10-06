import { useCallback,useEffect,useState } from 'react';
type Suggestion={id:string;phrase:string;meaning:string|null};
type Card={id:string;phrase:string;meaning:string|null;dueAt:string;version:number};
export function VocabularyPanel({csrf}:{csrf:string}){
 const [suggestions,setSuggestions]=useState<Suggestion[]>([]),[due,setDue]=useState<Card[]>([]),[next,setNext]=useState(''),[busy,setBusy]=useState(false);
 const load=useCallback(async()=>{const [s,d]=await Promise.all([fetch('/api/v1/vocabulary/suggestions',{credentials:'include'}),fetch('/api/v1/vocabulary/reviews/due?limit=20',{credentials:'include'})]);if(s.ok)setSuggestions(await s.json() as Suggestion[]);if(d.ok)setDue(await d.json() as Card[]);},[]);
 useEffect(()=>{void load();},[load]);
 const post=async(path:string,body:unknown={})=>{setBusy(true);try{const r=await fetch('/api/v1/vocabulary'+path,{method:'POST',credentials:'include',headers:{'content-type':'application/json','x-csrf-token':csrf},body:JSON.stringify(body)});if(r.ok)await load();return r;}finally{setBusy(false);}};
 const review=async(card:Card,rating:'again'|'hard'|'good'|'easy')=>{const key=crypto.randomUUID();const r=await post(`/cards/${card.id}/reviews`,{rating,reviewKey:key,expectedVersion:card.version});if(r.ok){const result=await r.json() as {card:Card};setNext(new Intl.DateTimeFormat('es',{dateStyle:'medium',timeStyle:'short'}).format(new Date(result.card.dueAt)));}};
 return <section aria-labelledby="vocabulary-title" className="vocabulary">
  <h2 id="vocabulary-title">Mi vocabulario</h2>
  <button className="secondary" disabled={busy} onClick={()=>void load()}>Actualizar vocabulario</button>
  {!suggestions.length&&<p>No hay sugerencias pendientes.</p>}
  {suggestions.map(s=><article key={s.id}><h3>{s.phrase}</h3>{s.meaning&&<p>{s.meaning}</p>}<div><button disabled={busy} onClick={()=>void post(`/suggestions/${s.id}/confirm`)}>Añadir al repaso</button> <button className="secondary" disabled={busy} onClick={()=>void post(`/suggestions/${s.id}/ignore`)}>Ignorar</button></div></article>)}
  <h2>Repaso de hoy</h2>
  {!due.length&&<p>Ya terminaste el repaso pendiente.</p>}
  {due[0]&&<article data-testid="due-card"><h3>{due[0].phrase}</h3>{due[0].meaning&&<p>{due[0].meaning}</p>}<div className="ratings">{([['again','Otra vez'],['hard','Difícil'],['good','Bien'],['easy','Fácil']] as const).map(([value,label])=><button disabled={busy} key={value} onClick={()=>void review(due[0]!,value)}>{label}</button>)}</div></article>}
  {next&&<p role="status">Próximo repaso: {next}</p>}
 </section>;
}
