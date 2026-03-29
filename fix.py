c=open('src/App.jsx','r',encoding='utf-8').read()
old='setScreen(\'guide\')}>About Bedikat Chametz</Btn>'
new=old+'{userName&&roomCode&&(<div style={{marginTop:8,padding:"12px",background:"rgba(0,122,255,.08)",borderRadius:14,textAlign:"center"}}><div style={{fontSize:12,color:"#636366"}}>Your active room</div><div style={{fontSize:22,fontWeight:700,letterSpacing:3,color:"#007AFF"}}>{'+'roomCode}</div><button onClick={()=>setScreen("session")} style={{marginTop:8,background:"#007AFF",color:"white",border:"none",borderRadius:10,padding:"8px 20px",fontSize:14,fontWeight:600,cursor:"pointer"}}>Rejoin Search</button></div>)}'
c=c.replace(old,new)
open('src/App.jsx','w',encoding='utf-8').write(c)
print('Done!')