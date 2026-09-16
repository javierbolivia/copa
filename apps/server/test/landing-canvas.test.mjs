import {describe,it,expect} from 'vitest';
import {toLandingCanvas,fromLandingCanvas,LANDING_BLOCKS} from '../../web/src/features/refinement/landing-puck-adapter.ts';
import {toLanding} from '../../web/src/features/refinement/landing-adapter.ts';
import {renderLandingHtml,renderLandingReactCode} from '@our-platform/shared';
describe('Hallazia visual editor boundary',()=>{
 it('provides every required block and retains unknown sections, evidence and metadata across reorder/disable',()=>{
  expect(Object.keys(LANDING_BLOCKS)).toHaveLength(15);
  const value=toLanding({title:'Página',sections:[{type:'hero',headline:'Apertura',evidenceIds:['ref'],extra:{keep:true}},{type:'future-block',headline:'Custom',items:[{q:'Pregunta',a:'Respuesta',source:'keep'}]}]});
  const data=toLandingCanvas(value);data.content.reverse();data.content[0].props.enabled=false;
  const saved=fromLandingCanvas(value,data);
  expect(saved.sections).toEqual([{...value.sections[1],id:'legacy-1',enabled:false},{...value.sections[0],id:'legacy-0'}]);
  expect(fromLandingCanvas(saved,toLandingCanvas(saved))).toEqual(saved);
  const html=renderLandingHtml({title:saved.pageName,sections:saved.sections});expect(html).toContain('Apertura');expect(html).not.toContain('Custom');
 });
 it('exports escaped text and rejects arbitrary CSS through tokens',()=>{
  const html=renderLandingHtml({title:'<script>alert(1)</script>',designTokens:{accent:'red;}body{display:none}',font:'url(https://bad)'},sections:[{type:'hero',headline:'<img src=x onerror=alert(1)>',variant:'centered'}]});
  expect(html).not.toContain('<script>');expect(html).not.toContain('<img');expect(html).not.toContain('https://bad');expect(html).toContain('centered');
 });
 it('preserves theme presets across canvas roundtrip and renders theme styling',()=>{
  const value=toLanding({title:'Página Temática',designTokens:{theme:'dark',accent:'#6366f1'},sections:[{type:'hero',headline:'Oscuro Hero'},{type:'footer',headline:'Pie',copyright:'2026'}]});
  const canvas=toLandingCanvas(value);
  const restored=fromLandingCanvas(value,canvas);
  expect(restored.designTokens?.theme).toBe('dark');
  const html=renderLandingHtml(restored);
  expect(html).toContain('#0b0f19'); // dark bg token
  expect(html).toContain('Oscuro Hero');
 });
 it('generates standalone React component without Puck dependencies',()=>{
  const value={pageName:'Landing React',theme:'editorial',sections:[{type:'hero',headline:'Título TSX'},{type:'problem',headline:'Dolores'},{type:'offer',headline:'Oferta TSX',price:'$47',bonuses:[{title:'Bono 1'}]},{type:'cta',headline:'Comprar Ahora',cta:'Unirse'}]};
  const reactCode=renderLandingReactCode(value);
  expect(reactCode).toContain('export default function LandingPage');
  expect(reactCode).not.toContain('@measured/puck');
  expect(reactCode).toContain('Título TSX');
  expect(reactCode).toContain('Bono 1');
  expect(reactCode).toContain('$47');
  expect(reactCode).toContain('serif');
 });
});
