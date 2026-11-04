import {test,expect} from '@playwright/test';

test('development server never serves private local runtime files',async({request})=>{
  for(const path of ['/.local/runtime.json','/@fs/C:/Nexus/.local/runtime.json','/.git/config']){
    const response=await request.get(path);
    expect([403,404],path).toContain(response.status());
  }
});
