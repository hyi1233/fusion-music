import{t as e}from"./pixiFilterVertex-B78uyzyn.js";import{t}from"./defineProperty-BbfpZ9Tg.js";var n=globalThis.devicePixelRatio|0,r=(102^n)+Math.imul(111^n,108^n)-((102^n)+Math.imul(111^n,108^n)),i=`
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform vec4 uInputPixel;
uniform vec4 uInputClamp;
uniform vec4 uParams; // threshold, knee, prefilter(0/1), 0

vec4 tap(vec2 uv) {
    return texture(uTexture, clamp(uv, uInputClamp.xy, uInputClamp.zw));
}

void main(void) {
    vec2 uv = vTextureCoord;
    vec2 hp = uInputPixel.zw;
    vec4 sum = tap(uv) * 4.0;
    sum += tap(uv - hp);
    sum += tap(uv + hp);
    sum += tap(uv + vec2(hp.x, -hp.y));
    sum += tap(uv - vec2(hp.x, -hp.y));
    vec4 c = sum / 8.0;
    if (uParams.z > 0.5) {
        float br = max(c.r, max(c.g, c.b));
        float knee = max(uParams.y, 1e-4);
        float soft = clamp(br - uParams.x + knee, 0.0, 2.0 * knee);
        soft = soft * soft / (4.0 * knee);
        float contrib = max(soft, br - uParams.x) / max(br, 1e-4);
        c *= clamp(contrib, 0.0, 1.0);
    }
    finalColor = c;
}
`,a=`
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform sampler2D uAdd;
uniform vec4 uInputPixel;
uniform vec4 uInputClamp;
uniform vec4 uAddMap;   // uv 缩放 xy、同级权重、0
uniform vec4 uAddClamp;

vec4 tap(vec2 uv) {
    return texture(uTexture, clamp(uv, uInputClamp.xy, uInputClamp.zw));
}

void main(void) {
    vec2 uv = vTextureCoord;
    vec2 hp = uInputPixel.zw;
    vec4 sum = tap(uv + vec2(-hp.x * 2.0, 0.0));
    sum += tap(uv + vec2(-hp.x, hp.y)) * 2.0;
    sum += tap(uv + vec2(0.0, hp.y * 2.0));
    sum += tap(uv + vec2(hp.x, hp.y)) * 2.0;
    sum += tap(uv + vec2(hp.x * 2.0, 0.0));
    sum += tap(uv + vec2(hp.x, -hp.y)) * 2.0;
    sum += tap(uv + vec2(0.0, -hp.y * 2.0));
    sum += tap(uv + vec2(-hp.x, -hp.y)) * 2.0;
    vec4 up = sum / 12.0;
    vec4 same = texture(uAdd, clamp(uv * uAddMap.xy, uAddClamp.xy, uAddClamp.zw));
    finalColor = up + same * uAddMap.z;
}
`,o=`
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform sampler2D uAdd;
uniform vec4 uInputClamp;
uniform vec4 uAddMap;   // uv 缩放 xy、强度、0
uniform vec4 uAddClamp;
uniform vec4 uTint;     // 乘在 bloom 上的颜色

void main(void) {
    vec4 base = texture(uTexture, clamp(vTextureCoord, uInputClamp.xy, uInputClamp.zw));
    vec4 glow = texture(uAdd, clamp(vTextureCoord * uAddMap.xy, uAddClamp.xy, uAddClamp.zw)) * uAddMap.z;
    vec3 g = glow.rgb * uTint.rgb;
    // 加上去的辉光也是光：预乘、alpha 取最大通道（与光场一致，近似 screen）。
    vec3 rgb = base.rgb + g * (1.0 - base.a * 0.5);
    // 超过 1 时按最大通道整体缩回（保持金色），只让一小部分变白；逐通道截断会把亮字烧成白块。
    float peak = max(max(rgb.r, rgb.g), rgb.b);
    if (peak > 1.0) rgb = mix(rgb / peak, vec3(1.0), 0.2 * (1.0 - 1.0 / peak));
    float a = base.a + max(max(g.r, g.g), g.b) * (1.0 - base.a);
    finalColor = vec4(rgb, min(max(a, max(max(rgb.r, rgb.g), rgb.b)), 1.0));
}
`,s=(n,s)=>{let{Filter:c,GlProgram:l,TexturePool:u,UniformGroup:d}=n,f=(t,n)=>l.from({vertex:e,fragment:t,name:n}),p=new d({uParams:{value:new Float32Array(4),type:`vec4<f32>`}}),m=new c({glProgram:f(i,`lumiere-bloom-down`),resources:{bloomDown:p}}),h=new d({uAddMap:{value:new Float32Array(4),type:`vec4<f32>`},uAddClamp:{value:new Float32Array(4),type:`vec4<f32>`}}),g=new c({glProgram:f(a,`lumiere-bloom-up`),resources:{bloomUp:h,uAdd:n.Texture.EMPTY.source}}),_=new d({uAddMap:{value:new Float32Array(4),type:`vec4<f32>`},uAddClamp:{value:new Float32Array(4),type:`vec4<f32>`},uTint:{value:new Float32Array([1,1,1,1]),type:`vec4<f32>`}}),v=new c({glProgram:f(o,`lumiere-bloom-combine`),resources:{bloomCombine:_,uAdd:n.Texture.EMPTY.source}}),y=(e,t,n,r,i)=>{n[0]=e.source.width/t.source.width,n[1]=e.source.height/t.source.height,n[2]=i,r[0]=.5/t.source.pixelWidth,r[1]=.5/t.source.pixelHeight,r[2]=t.frame.width/t.source.width-.5/t.source.pixelWidth,r[3]=t.frame.height/t.source.height-.5/t.source.pixelHeight};class b extends c{constructor(e){super({resources:{},compatibleRenderers:n.RendererType.BOTH}),t(this,`options`,void 0),t(this,`passes`,[m,g,v]),this.options={...e},this.padding=e.padding}apply(e,t,n,i){let{strength:a,threshold:o,knee:s,levels:c,spread:l,tint:d}=this.options,f=()=>{y(t,t,_.uniforms.uAddMap,_.uniforms.uAddClamp,0),_.update(),v.resources.uAdd=t.source,v.blendMode=this.blendMode,e.applyFilter(v,t,n,i)};if(a<=0){f();return}let b=t.frame.width,x=t.frame.height,S=t.source.resolution,C=[],w=t,T=Math.max(1,Math.min(8+r,Math.round(c)));for(let t=1;t<=T;t+=1){let n=S/2**t;if(Math.min(b,x)*n<2)break;let r=u.getOptimalTexture({width:b,height:x,resolution:n}),i=p.uniforms.uParams;i[0]=o,i[1]=s,i[2]=+(t===1),p.update(),m.blendMode=`normal`,e.applyFilter(m,w,r,!0),C.push(r),w=r}if(C.length===0){f();return}let E=C[C.length-1],D=[];for(let t=C.length-2;t>=0;--t){let n=C[t],r=u.getOptimalTexture({width:b,height:x,resolution:n.source.resolution});y(E,n,h.uniforms.uAddMap,h.uniforms.uAddClamp,l),h.update(),g.resources.uAdd=n.source,g.blendMode=`normal`,e.applyFilter(g,E,r,!0),D.push(r),E=r}y(t,E,_.uniforms.uAddMap,_.uniforms.uAddClamp,a);let O=_.uniforms.uTint;O[0]=d[0],O[1]=d[1],O[2]=d[2],_.update(),v.resources.uAdd=E.source,v.blendMode=this.blendMode,e.applyFilter(v,t,n,i),C.forEach(e=>u.returnTexture(e)),D.forEach(e=>u.returnTexture(e))}destroy(){m.destroy(),g.destroy(),v.destroy(),super.destroy()}}return new b(s)};export{s as t};