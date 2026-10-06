// @vitest-environment happy-dom
import {afterEach,expect,it,vi} from 'vitest';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {LandingBuilder} from '../../web/src/features/refinement/LandingBuilder.tsx';
import {api} from '../../web/src/api/client.ts';

globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const spies=[];
afterEach(()=>{for(const spy of spies.splice(0))spy.mockRestore();document.body.replaceChildren();});

it.each(['Cancelar','Guardar borrador'])('does not attach a generated image after %s ends the edit session',async(action)=>{
  spies.push(vi.spyOn(api,'productAssets').mockResolvedValue({assets:[]}));
  spies.push(vi.spyOn(api,'landingImageStatus').mockResolvedValue({configured:true,model:'test',paidModel:true}));
  let finish;
  spies.push(vi.spyOn(api,'generateLandingImage').mockImplementation(()=>new Promise(resolve=>{finish=resolve;})));
  const host=document.createElement('div');document.body.append(host);
  const root=createRoot(host);
  const value={pageName:'Página',designTokens:{accent:'#000000',background:'#ffffff',text:'#000000',font:'sans',width:'compact',spacing:'relaxed'},sections:[{id:'hero-1',type:'hero',headline:'Inicio'}]};
  const button=(label)=>[...host.querySelectorAll('button')].find(item=>item.textContent?.trim()===label);
  await act(async()=>root.render(React.createElement(LandingBuilder,{projectId:'project-a',selectedVersionId:'version-1',value,versions:[],onSave:async()=>true})));
  await act(async()=>button('Editar').click());
  const prompt=host.querySelector('textarea[placeholder^="Ej.:"]');
  await act(async()=>{const setter=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;setter.call(prompt,'Una ilustración editorial de un paseo tranquilo');prompt.dispatchEvent(new Event('input',{bubbles:true}));});
  await act(async()=>button('Generar una imagen con Gemini').click());
  expect(finish).toBeTypeOf('function');
  await act(async()=>button(action).click());
  await act(async()=>button('Editar').click());
  await act(async()=>finish({id:'asset-1',kind:'image',url:'/assets/old.webp',title:'Anterior'}));
  expect(host.querySelector('input[aria-label="Imagen · URL HTTPS o ruta local"]')?.value).toBe('');
  await act(async()=>root.unmount());
});

it.each([
  ['another project','project-b','version-1'],
  ['another version','project-a','version-2'],
])('does not carry an unfinished edit or image result into %s',async(_scope,projectId,versionId)=>{
  spies.push(vi.spyOn(api,'productAssets').mockResolvedValue({assets:[]}));
  spies.push(vi.spyOn(api,'landingImageStatus').mockResolvedValue({configured:true,model:'test',paidModel:true}));
  let finish;
  spies.push(vi.spyOn(api,'generateLandingImage').mockImplementation(()=>new Promise(resolve=>{finish=resolve;})));
  const host=document.createElement('div');document.body.append(host);
  const root=createRoot(host);
  const value=(headline)=>({pageName:'Página',designTokens:{accent:'#000000',background:'#ffffff',text:'#000000',font:'sans',width:'compact',spacing:'relaxed'},sections:[{id:'hero-1',type:'hero',headline}]});
  const render=(projectId,selectedVersionId,headline)=>act(async()=>root.render(React.createElement(LandingBuilder,{projectId,selectedVersionId,value:value(headline),versions:[],onSave:async()=>true})));
  const button=(label)=>[...host.querySelectorAll('button')].find(item=>item.textContent?.trim()===label);
  await render('project-a','version-1','Anterior');
  await act(async()=>button('Editar').click());
  const prompt=host.querySelector('textarea[placeholder^="Ej.:"]');
  await act(async()=>{const setter=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;setter.call(prompt,'Una ilustración editorial de un paseo tranquilo');prompt.dispatchEvent(new Event('input',{bubbles:true}));});
  await act(async()=>button('Generar una imagen con Gemini').click());
  await render(projectId,versionId,'Nuevo proyecto');
  await act(async()=>finish({id:'asset-1',kind:'image',url:'/assets/old.webp',title:'Anterior'}));
  expect(host.textContent).toContain('Nuevo proyecto');
  expect(host.textContent).not.toContain('Anterior');
  expect(host.querySelector('input[aria-label="Imagen · URL HTTPS o ruta local"]')?.value??'').not.toBe('/assets/old.webp');
  await act(async()=>root.unmount());
});

it('ignores an old save completion after editing a new project',async()=>{
  spies.push(vi.spyOn(api,'productAssets').mockResolvedValue({assets:[]}));
  spies.push(vi.spyOn(api,'landingImageStatus').mockResolvedValue({configured:false,model:'test',paidModel:true}));
  let finish;
  const host=document.createElement('div');document.body.append(host);
  const root=createRoot(host);
  const value=(headline)=>({pageName:'Página',designTokens:{accent:'#000000',background:'#ffffff',text:'#000000',font:'sans',width:'compact',spacing:'relaxed'},sections:[{id:'hero-1',type:'hero',headline}]});
  const render=(projectId,headline)=>act(async()=>root.render(React.createElement(LandingBuilder,{projectId,selectedVersionId:'version-1',value:value(headline),versions:[],onSave:()=>new Promise(resolve=>{finish=resolve;})})));
  const button=(label)=>[...host.querySelectorAll('button')].find(item=>item.textContent?.trim()===label);
  await render('project-a','Anterior');
  await act(async()=>button('Editar').click());
  await act(async()=>button('Guardar borrador').click());
  await render('project-b','Nuevo proyecto');
  await act(async()=>button('Editar').click());
  await act(async()=>finish(true));
  expect(button('Cancelar')).toBeTruthy();
  expect(host.textContent).toContain('Nuevo proyecto');
  await act(async()=>root.unmount());
});
