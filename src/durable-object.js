import {DurableObject} from 'cloudflare:workers';
import {AnswerStream as AnswerStreamCore} from './answer-stream.js';
// Real Cloudflare runtime entrypoint. The separately tested core has no runtime shim.
export class AnswerStream extends DurableObject {
 constructor(ctx,env){super(ctx,env);this.core=new AnswerStreamCore(ctx)}
 fetch(request){return this.core.fetch(request)}
 alarm(){return this.core.alarm()}
}
