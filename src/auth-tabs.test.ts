import {describe,it,expect} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {AuthForm} from './LiveWorkspace';
import {WorkspaceApi} from './live-api';
describe('authentication tab semantics',()=>{
 const render=(registration:boolean,bootstrap=false)=>renderToStaticMarkup(createElement(AuthForm,{api:new WorkspaceApi(),registration,bootstrap,onAuthenticated:()=>{},onBootstrapConflict:()=>{}}));
 it('closed registration and bootstrap have no one-item tablist',()=>{
  for(const html of [render(false),render(true,true)]){expect(html).not.toContain('role="tablist"');expect(html).not.toContain('role="tabpanel"');}
 });
 it('open registration links both tabs and panels and has one tab stop',()=>{
  const html=render(true);
  for(const mode of ['login','register']){expect(html).toContain(`id="auth-tab-${mode}" aria-controls="auth-panel-${mode}"`);expect(html).toContain(`id="auth-panel-${mode}" aria-labelledby="auth-tab-${mode}"`);}
  expect(html.match(/tabindex="0"/g)).toHaveLength(1);expect(html.match(/tabindex="-1"/g)).toHaveLength(1);
 });
});
