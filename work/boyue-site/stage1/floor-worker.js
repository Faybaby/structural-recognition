import {calculateFloors} from './floor-core.js';
self.onmessage=e=>{const {input,settings,requestId}=e.data;try{const result=calculateFloors(input,settings,(done,total)=>self.postMessage({requestId,type:'progress',done,total}));self.postMessage({requestId,type:'result',result});}catch(error){self.postMessage({requestId,type:'error',message:error.message});}};
