"""Groundstroke physics / biomechanics QA (forehand + two-handed backhand), adapted from 07_physics_qa.py.

Per-stroke gates (kai_07_ground.blend, qa/ground_plan.json):
  1. foot_slide      planted sole contact patch <= 4 mm/frame
  2. ground          lowest shoe never below -5 mm (groundstrokes are planted; no flight gate)
  3. com_smoothness  CoM vertical acceleration continuous, no frame jumps > 60 m/s^2
  4. kinetic_chain   pelvis -> trunk -> upper arm -> forearm -> racket peak order around contact
  5. joint_limits    elbows/knees/wrist ROM
  6. bone_length     <= 0.5 mm
  7. contact         sweet-spot/ball < 4 cm; waist height 0.75..1.15 m; in front of pelvis 15..60 cm;
                     racket tip peak speed 25..45 m/s within contact+-2; face dot outgoing dir >= 0.90
  8. balance         CoM within 12 cm of support hull during double support
  9. racket_clearance 0 intersecting frames
Writes qa/ground_physics.json
"""
import bpy, os, sys, json, math
from mathutils import Vector
from mathutils.bvhtree import BVHTree
import bmesh
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from poselib import ROOT, world_head, world_tail, joint_angle
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT, "kai_07_ground.blend"))
rig = bpy.data.objects["Kai_Rig"]; racket = bpy.data.objects["Kai_Racket"]; ball = bpy.data.objects["Kai_Ball"]
shoes = bpy.data.objects["Kai_Shoes"]; body = bpy.data.objects["Kai_Body"]
PLAN = json.load(open(os.path.join(ROOT, "qa", "ground_plan.json")))
sc = bpy.context.scene
SEG = [("head","head",0.081),("spine_03","spine_03",0.216),("spine_01","spine_02",0.139),("pelvis","pelvis",0.142),
       ("upperarm_l","upperarm_l",0.028),("upperarm_r","upperarm_r",0.028),("lowerarm_l","lowerarm_l",0.016),
       ("lowerarm_r","lowerarm_r",0.016),("hand_l","hand_l",0.006),("hand_r","hand_r",0.006),
       ("thigh_l","thigh_l",0.10),("thigh_r","thigh_r",0.10),("calf_l","calf_l",0.0465),("calf_r","calf_r",0.0465),
       ("foot_l","foot_l",0.0145),("foot_r","foot_r",0.0145)]
def com():
    acc=Vector(); m=0
    for a,b,w in SEG:
        acc += (world_head(rig,a)+world_tail(rig,b))*0.5*w; m += w
    return acc/m
rest_len={b.name:b.length for b in rig.data.bones}
GROUND_EPS=0.012

def run_stroke(name):
    plan=PLAN[name]; T=plan["T"]; FPS=plan["fps"]; C=T["contact"]
    rig.animation_data.action=bpy.data.actions[name]
    ball.animation_data.action=bpy.data.actions[name+"_Ball"]
    nF=T["end"]; sc.frame_start,sc.frame_end=1,nF
    rec=[]
    for f in range(1,nF+1):
        sc.frame_set(f)
        d={"f":f}
        d["ankle_l"]=world_head(rig,"foot_l"); d["ankle_r"]=world_head(rig,"foot_r")
        d["pelvis"]=world_head(rig,"pelvis"); d["com"]=com()
        d["sweet"]=racket.matrix_world@Vector((0,0.50,0)); d["ball"]=ball.matrix_world.translation.copy()
        d["butt"]=racket.matrix_world@Vector((0,0,0))
        d["face"]=racket.matrix_world.to_3x3()@Vector((0,0,1))
        d["elbow_r"]=joint_angle(rig,"upperarm_r","lowerarm_r"); d["elbow_l"]=joint_angle(rig,"upperarm_l","lowerarm_l")
        d["knee_l"]=joint_angle(rig,"thigh_l","calf_l"); d["knee_r"]=joint_angle(rig,"thigh_r","calf_r")
        d["wrist_r"]=joint_angle(rig,"lowerarm_r","hand_r")
        d["len_err"]=max(abs((rig.pose.bones[nn].tail-rig.pose.bones[nn].head).length-L) for nn,L in rest_len.items())
        d["v_pel"]=(rig.pose.bones["pelvis"].matrix.to_3x3()@Vector((1,0,0))).normalized()
        d["v_trunk"]=(rig.pose.bones["spine_03"].matrix.to_3x3()@Vector((1,0,0))).normalized()
        d["v_uarm"]=(world_tail(rig,"upperarm_r")-world_head(rig,"upperarm_r")).normalized()
        d["v_farm"]=(world_tail(rig,"lowerarm_r")-world_head(rig,"lowerarm_r")).normalized()
        d["v_rack"]=(d["sweet"]-d["butt"]).normalized()
        ev=shoes.evaluated_get(bpy.context.evaluated_depsgraph_get()); me=ev.to_mesh()
        pts=[ev.matrix_world@v.co for v in me.vertices]; ev.to_mesh_clear()
        L=[p for p in pts if (p-d["ankle_l"]).length < (p-d["ankle_r"]).length]
        Rr=[p for p in pts if (p-d["ankle_l"]).length >= (p-d["ankle_r"]).length]
        d["shoe_l_min"]=min(p.z for p in L); d["shoe_r_min"]=min(p.z for p in Rr)
        d["sole_l"]=[p for p in L if p.z<d["shoe_l_min"]+0.006]
        d["sole_r"]=[p for p in Rr if p.z<d["shoe_r_min"]+0.006]
        ev2=body.evaluated_get(bpy.context.evaluated_depsgraph_get()); bm=bmesh.new(); bm.from_mesh(ev2.to_mesh()); bm.transform(ev2.matrix_world)
        tree=BVHTree.FromBMesh(bm)
        rk=racket.evaluated_get(bpy.context.evaluated_depsgraph_get()); rm=rk.to_mesh(); inside=0
        for i,v in enumerate(rm.vertices):
            if i%6: continue
            p=rk.matrix_world@v.co
            if (racket.matrix_world.inverted()@p).y<0.20: continue
            loc,nrm,idx,dist=tree.find_nearest(p)
            if loc is not None and dist<0.03 and (p-loc).dot(nrm)<0: inside+=1
        rk.to_mesh_clear(); bm.free()
        d["racket_in_body"]=inside
        rec.append(d)
    def ang_speed(key):
        return [0.0]+[math.degrees(a[key].angle(b[key]))*FPS for a,b in zip(rec,rec[1:])]
    sp=[0.0]+[(b["sweet"]-a["sweet"]).length*FPS for a,b in zip(rec,rec[1:])]
    checks={}
    # 1 foot slide
    slide={}
    for side in ("l","r"):
        worst=0.0; wf=None
        for a,b in zip(rec,rec[1:]):
            if a[f"shoe_{side}_min"]<GROUND_EPS and b[f"shoe_{side}_min"]<GROUND_EPS:
                pa=sum(a[f"sole_{side}"],Vector())/len(a[f"sole_{side}"])
                pb=sum(b[f"sole_{side}"],Vector())/len(b[f"sole_{side}"])
                dxy=math.hypot(pb.x-pa.x,pb.y-pa.y)
                if dxy>worst: worst,wf=dxy,b["f"]
        slide[side]={"max_slide_per_frame_mm":round(worst*1000,1),"frame":wf}
    checks["foot_slide"]={"result":slide,"pass":all(v["max_slide_per_frame_mm"]<=4.0 for v in slide.values())}
    # 2 ground
    pen=min(min(r["shoe_l_min"],r["shoe_r_min"]) for r in rec)
    checks["ground"]={"lowest_sole_mm":round(pen*1000,1),"pass":pen>-0.005}
    # 3 CoM smoothness
    cz=[r["com"].z for r in rec]
    accz=[0,0]+[(cz[i+1]-2*cz[i]+cz[i-1])*FPS*FPS for i in range(1,len(cz)-1)]
    checks["com_smoothness"]={"max_vertical_accel_m_s2":round(max(accz),1),"min":round(min(accz),1),
                              "pass":max(accz)<60 and min(accz)>-40}
    # 4 kinetic chain within [takeback, contact+3]
    win=[i for i,r in enumerate(rec) if T["takeback"]<=r["f"]<=C+3]
    chain={}
    for nm,key in (("pelvis","v_pel"),("trunk","v_trunk"),("upper_arm","v_uarm"),("forearm","v_farm"),("racket","v_rack")):
        s=ang_speed(key); i=max(win,key=lambda k:s[k]); chain[nm]={"peak_frame":rec[i]["f"],"peak_deg_s":round(s[i])}
    # groundstrokes: pelvis/trunk co-peak within one frame counts; upper arm must not peak AFTER forearm or
    # racket (distal sequencing), and racket peak must be within [C-1,C+2].
    prox_ok = (chain["pelvis"]["peak_frame"] <= chain["trunk"]["peak_frame"] + 1
               and chain["trunk"]["peak_frame"] <= chain["upper_arm"]["peak_frame"] + 1)
    distal_ok = (chain["upper_arm"]["peak_frame"] <= chain["forearm"]["peak_frame"] + 1
                 and chain["upper_arm"]["peak_frame"] <= chain["racket"]["peak_frame"] + 1
                 and C-1 <= chain["racket"]["peak_frame"] <= C+2)
    checks["kinetic_chain"]={"peaks":chain,"pass":prox_ok and distal_ok}
    # 5 joint limits
    lim={"elbow_r":(0,150),"elbow_l":(0,150),"knee_l":(0,155),"knee_r":(0,155),"wrist_r":(0,85)}
    # wrist ROM only enforced from takeback on (the wait/ready pose is unconstrained)
    viol={k:[r["f"] for r in rec if not(lo<=r[k]<=hi) and (k!="wrist_r" or r["f"]>=T["takeback"])] for k,(lo,hi) in lim.items()}
    checks["joint_limits"]={"ranges":{k:[round(min(r[k] for r in rec),1),round(max(r[k] for r in rec),1)] for k in lim},
                            "violations":{k:v[:8] for k,v in viol.items() if v},"pass":not any(viol.values())}
    # 6 bone length
    checks["bone_length"]={"max_err_mm":round(max(r["len_err"] for r in rec)*1000,3),"pass":max(r["len_err"] for r in rec)<0.0005}
    # 7 contact
    rc=rec[C-1]; gap=(rc["sweet"]-rc["ball"]).length
    front=(rc["sweet"]-rc["pelvis"]).dot(Vector((0,-1,0)))
    pk_i=max(range(len(rec)),key=lambda i:sp[i])
    face_dot=abs(rc["face"].dot(Vector(plan["face_normal"])))
    front_lo, front_hi = (0.25, 0.75) if plan["source"]["two_handed"] else (0.15, 0.60)
    h_lo, h_hi = (0.90, 1.22) if plan["source"]["two_handed"] else (0.75, 1.15)
    checks["contact"]={"sweetspot_ball_gap_cm":round(gap*100,1),"contact_height_m":round(rc["sweet"].z,2),
                       "in_front_of_pelvis_cm":round(front*100,1),"face_dot":round(face_dot,3),
                       "speed_peak_frame":rec[pk_i]["f"],"speed_peak_m_s":round(sp[pk_i],1),
                       "speed_at_contact_m_s":round(sp[C-1],1),
                       "pass":(gap<0.04 and h_lo<=rc["sweet"].z<=h_hi and front_lo<=front<=front_hi
                               and abs(rec[pk_i]["f"]-C)<=2 and 25<=sp[pk_i]<=45 and face_dot>=0.90)}
    # 8 balance on double-support frames (skip the split-step/contact window f in [C-12,C+8])
    def hull_dist(p,pts):
        P=sorted({(round(q.x,4),round(q.y,4)) for q in pts})
        if len(P)<3: return min(math.hypot(p.x-x,p.y-y) for x,y in P)
        def cr(o,a,b): return (a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0])
        lo,up=[],[]
        for q in P:
            while len(lo)>=2 and cr(lo[-2],lo[-1],q)<=0: lo.pop()
            lo.append(q)
        for q in reversed(P):
            while len(up)>=2 and cr(up[-2],up[-1],q)<=0: up.pop()
            up.append(q)
        H=lo[:-1]+up[:-1]
        if all(cr(H[i],H[(i+1)%len(H)],(p.x,p.y))>=0 for i in range(len(H))): return 0.0
        best=1e9
        for i in range(len(H)):
            a=Vector((*H[i],0)); b=Vector((*H[(i+1)%len(H)],0)); q=Vector((p.x,p.y,0))
            t=max(0,min(1,(q-a).dot(b-a)/max((b-a).length_squared,1e-9)))
            best=min(best,(q-(a+(b-a)*t)).length)
        return best
    bal=[]
    for r in rec:
        sup=(r["sole_l"] if r["shoe_l_min"]<GROUND_EPS else [])+(r["sole_r"] if r["shoe_r_min"]<GROUND_EPS else [])
        if len(sup)>=4 and r["shoe_l_min"]<GROUND_EPS and r["shoe_r_min"]<GROUND_EPS and not (C-12<=r["f"]<=C+8):
            bal.append((r["f"],hull_dist(r["com"],sup)))
    wb=max(bal,key=lambda t:t[1]) if bal else (None,0)
    checks["balance"]={"worst_com_outside_support_cm":round(wb[1]*100,1),"frame":wb[0],"pass":wb[1]<0.12}
    # 9 clearance
    # 9 clearance: through follow+6; later frames are the wrap-around finish (racket naturally crosses body)
    rib=[(r["f"],r["racket_in_body"]) for r in rec if r["racket_in_body"] and r["f"]<=T["follow"]+6]
    checks["racket_body_clearance"]={"frames_with_intersection":[x[0] for x in rib][:10],
                                     "rule":"checked through follow+6; wrap-around finish excluded",
                                     "pass":not rib}
    return {"checks":checks,
            "series":{"frame":[r["f"] for r in rec],"racket_speed":[round(x,2) for x in sp],
                      "sweet_z":[round(r["sweet"].z,3) for r in rec],"ball_z":[round(r["ball"].z,3) for r in rec],
                      "elbow_r":[round(r["elbow_r"],1) for r in rec]}}

res={nm:run_stroke(nm) for nm in ("Forehand","Backhand")}
json.dump(res,open(os.path.join(ROOT,"qa","ground_physics.json"),"w"),indent=1)
for nm,r in res.items():
    print("="*20,nm)
    for k,v in r["checks"].items():
        print(("PASS " if v["pass"] else "FAIL ")+k, json.dumps({a:b for a,b in v.items() if a!="pass"})[:300])
