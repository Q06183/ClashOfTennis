"""Pure-python SVG stick figures from BVH around a contact frame (no matplotlib).
Top block: side view (along swing), bottom block: front view (across swing)."""
import sys, os, math
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "mocap"))
from bvh_tools import parse_bvh, fk

EDGES=[("Hips","Chest"),("Chest","Neck"),("Neck","Head"),("Head","Head_End"),
       ("LeftCollar","LeftShoulder"),("RightCollar","RightShoulder"),
       ("LeftShoulder","LeftElbow"),("LeftElbow","LeftWrist"),("LeftWrist","LeftWrist_End"),
       ("RightShoulder","RightElbow"),("RightElbow","RightWrist"),("RightWrist","RightWrist_End"),
       ("Hips","LeftHip"),("Hips","RightHip"),
       ("LeftHip","LeftKnee"),("LeftKnee","LeftAnkle"),("LeftAnkle","LeftAnkle_End"),
       ("RightHip","RightKnee"),("RightKnee","RightAnkle"),("RightAnkle","RightAnkle_End"),
       ("LeftShoulder","RightShoulder"),("LeftHip","RightHip")]

def render(bvh, hit, c, out, span=(-30,26), step=5):
    J,F,dt=parse_bvh(bvh)
    W=[fk(J,fr) for fr in F]
    def wr(i):
        q=W[i][hit+"Wrist"][0]; return (q[0],q[2])
    vx=wr(c+3)[0]-wr(c-3)[0]; vz=wr(c+3)[1]-wr(c-3)[1]
    L=math.hypot(vx,vz); fx,fz=vx/L,vz/L
    frames=list(range(c+span[0], c+span[1]+1, step))
    cell=260; pad=24; cols=4
    rows_per_view=math.ceil(len(frames)/cols)
    Wpx=cell*cols+pad*2; Hpx=cell*2*rows_per_view+pad*2
    s=cell/200.0
    parts=[f'<svg xmlns="http://www.w3.org/2000/svg" width="{Wpx}" height="{Hpx}" viewBox="0 0 {Wpx} {Hpx}">',
           f'<rect width="{Wpx}" height="{Hpx}" fill="white"/>']
    for vr,view in enumerate(("side","front")):
        for k,i in enumerate(frames):
            rr=k//cols; cc=k%cols
            ox=pad+cc*cell+cell/2
            oy=pad+(vr*rows_per_view+rr)*cell+cell-24
            w=W[i]
            def Q(n, w=w, view=view):
                x,y,z=w[n][0]
                if view=="side":
                    X=x*fx+z*fz
                else:
                    X=x*fz-z*fx
                return (ox+X*s, oy-y*s)
            for a,b in EDGES:
                if a in w and b in w:
                    pa,pb=Q(a),Q(b)
                    parts.append(f'<line x1="{pa[0]:.1f}" y1="{pa[1]:.1f}" x2="{pb[0]:.1f}" y2="{pb[1]:.1f}" stroke="#333" stroke-width="2"/>')
            hx,hy=Q(hit+"Wrist_End")
            parts.append(f'<circle cx="{hx:.1f}" cy="{hy:.1f}" r="5" fill="#c0392b"/>')
            parts.append(f'<text x="{ox-cell/2+10:.0f}" y="{oy-cell+28:.0f}" font-size="15" fill="#555">{view} f{i} ({(i-c)*dt:+.2f}s)</text>')
            # ground line
            parts.append(f'<line x1="{ox-cell/2+12:.0f}" y1="{oy+4:.0f}" x2="{ox+cell/2-12:.0f}" y2="{oy+4:.0f}" stroke="#bbb" stroke-width="1"/>')
    parts.append("</svg>")
    open(out,"w").write("\n".join(parts)); print("saved",out)

if __name__=="__main__":
    render("/tmp/tennis-mocap/data/jarua_Derecha_18seg.bvh","Right",609,"/tmp/fh_stick.svg")
    render("/tmp/tennis-mocap/data/jarua_Reves.bvh","Left",757,"/tmp/bh_stick.svg")
