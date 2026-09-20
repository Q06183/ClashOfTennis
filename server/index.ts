import { networkInterfaces } from 'node:os';
import { createGameServer } from './app.js';
const port=Number(process.env.PORT??7470);
const server=await createGameServer({port,host:process.env.HOST??'0.0.0.0'});
console.log(`Rally Club listening at http://localhost:${server.port}`);
for(const list of Object.values(networkInterfaces()))for(const i of list??[])if(i.family==='IPv4'&&!i.internal)console.log(`LAN: http://${i.address}:${server.port}`);
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{void server.close().then(()=>process.exit(0));});
