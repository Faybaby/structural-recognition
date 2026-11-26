import {calculate} from './calculate.js';
self.onmessage=e=>{try{self.postMessage({run:e.data.run,progress:'计算线程已启动，正在匹配基准、GL和三维承托面…'});const result=calculate(e.data.data,e.data.config,progress=>self.postMessage({run:e.data.run,progress}));delete result.verification;self.postMessage({run:e.data.run,result});}catch(error){self.postMessage({run:e.data.run,error:String(error.stack||error)});}};
