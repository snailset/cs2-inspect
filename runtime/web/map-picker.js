export function createMapPicker(maps){
  const button=document.getElementById('mapselect'),menu=document.getElementById('mapoptions');
  const change=document.getElementById('changemap'),picker=document.getElementById('mappicker');
  let selected=maps.find(map=>map.id==='de_dust2'),state={};
  const options=[];
  function close(focus=false){menu.hidden=true;button.setAttribute('aria-expanded','false');if(focus)button.focus()}
  function sync(next=state){
    state=next;button.disabled=!!state.busy;
    change.disabled=!!state.busy||!state.server||!selected?.available||state.currentMap===selected?.id;
    if(state.busy)close();
  }
  function choose(map){
    selected=map;document.getElementById('mapname').textContent=map.name;
    const icon=document.getElementById('mapicon');icon.hidden=false;icon.src=map.icon;
    for(const option of options)option.setAttribute('aria-selected',String(option.dataset.map===map.id));
    sync();
  }
  for(const map of maps){
    const option=document.createElement('button');option.type='button';option.className='mapoption';option.role='option';
    option.dataset.map=map.id;option.tabIndex=-1;option.disabled=!map.available;
    const icon=document.createElement('img');icon.src=map.icon;icon.alt='';icon.width=36;icon.height=36;icon.onerror=()=>icon.hidden=true;
    const label=document.createElement('span');label.textContent=map.name;option.append(icon,label);
    option.onclick=()=>{choose(map);close(true)};
    option.onkeydown=event=>{
      const enabled=options.filter(option=>!option.disabled),index=enabled.indexOf(option);
      let target;
      if(['ArrowDown','ArrowRight'].includes(event.key))target=enabled[(index+1)%enabled.length];
      if(['ArrowUp','ArrowLeft'].includes(event.key))target=enabled[(index+enabled.length-1)%enabled.length];
      if(event.key==='Home')target=enabled[0];if(event.key==='End')target=enabled.at(-1);
      if(target){event.preventDefault();target.focus()}
      if(event.key==='Escape'){event.preventDefault();close(true)}
      if(event.key==='Tab')close();
    };
    options.push(option);menu.append(option);
  }
  const open=()=>{menu.hidden=false;button.setAttribute('aria-expanded','true');(options.find(o=>o.dataset.map===selected?.id&&!o.disabled)||options.find(o=>!o.disabled))?.focus()};
  button.onclick=()=>menu.hidden?open():close(true);
  button.onkeydown=event=>{if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();open()}if(event.key==='Escape')close()};
  document.addEventListener('click',event=>{if(!picker.contains(event.target))close()});
  document.getElementById('mapicon').onerror=event=>event.target.hidden=true;
  if(selected)choose(selected);else button.disabled=true;
  return {get value(){return selected?.id||'de_dust2'},sync};
}
