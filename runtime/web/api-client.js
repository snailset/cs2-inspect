export function createApi({fetcher=globalThis.fetch.bind(globalThis),initialToken='',onRenew=()=>{}}={}){
  let token=initialToken;
  async function request(url,data,retry=true){
    const response=await fetcher(url,data===undefined?{cache:'no-store'}:{method:'POST',headers:{'Content-Type':'application/json','X-Inspect-Token':token},body:JSON.stringify(data),cache:'no-store'});
    const body=await response.json();
    if(response.status===403&&body.code==='SESSION_EXPIRED'&&retry){
      const renewed=await fetcher('/api/session',{cache:'no-store'});
      if(!renewed.ok)throw new Error('无法连接本地控制台');
      token=(await renewed.json()).token;onRenew();return request(url,data,false);
    }
    if(!response.ok)throw new Error(body.error||'请求失败');
    if(body.token)token=body.token;
    return body;
  }
  return request;
}
