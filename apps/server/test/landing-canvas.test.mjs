import {describe,it,expect} from 'vitest';
import {toLandingCanvas,fromLandingCanvas,LANDING_BLOCKS} from '../../web/src/features/refinement/landing-puck-adapter.ts';
import {toLanding} from '../../web/src/features/refinement/landing-adapter.ts';
import {renderLandingHtml} from '@our-platform/shared';
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
});
