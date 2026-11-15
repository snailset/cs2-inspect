import net from 'node:net';
export function rcon(command, password, port=27015) {
  return new Promise((resolve,reject)=>{
    const socket=net.createConnection({host:'127.0.0.1',port});
    let input=Buffer.alloc(0), output='', quiet, done=false;
    const finish=(error)=>{if(done)return;done=true;clearTimeout(quiet);socket.destroy();error?reject(error):resolve(output)};
    const packet=(id,type,text)=>{const body=Buffer.from(text);const p=Buffer.alloc(body.length+14);p.writeInt32LE(body.length+10,0);p.writeInt32LE(id,4);p.writeInt32LE(type,8);body.copy(p,12);return p};
    socket.setTimeout(5000,()=>finish(new Error('本地服务器响应超时')));
    socket.on('error',finish);
    socket.on('connect',()=>socket.write(packet(10,3,password)));
    socket.on('data',chunk=>{
      input=Buffer.concat([input,chunk]);
      while(input.length>=4){
        const len=input.readInt32LE(0);if(len<10||len>1048576)return finish(new Error('RCON 数据格式错误'));
        if(input.length<len+4)return;
        const p=input.subarray(0,len+4);input=input.subarray(len+4);
        const id=p.readInt32LE(4),type=p.readInt32LE(8),text=p.subarray(12,len+2).toString('utf8');
        if(id===-1)return finish(new Error('本地服务器验证失败'));
        if(id===10&&type===2)socket.write(packet(20,2,command));
        if(id===20){output+=text;clearTimeout(quiet);quiet=setTimeout(()=>finish(),250)}
      }
    });
    socket.on('end',()=>finish(output?null:new Error('服务器关闭了连接')));
  });
}
