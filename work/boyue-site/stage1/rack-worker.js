import {calculateRack} from './rack-core.js';
self.onmessage=e=>{const {request,payload}=e.data;try{const result=calculateRack(payload,progress=>self.postMessage({request,progress}));self.postMessage({request,result});}catch(error){self.postMessage({request,error:error.message});}};
