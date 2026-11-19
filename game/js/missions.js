// Mara Voss's five story jobs, taxi fares and cash pickups. A beacon marks
// the current objective; the HUD shows the job name and what to do next.
import { dist2, fmtCash } from './util.js';
import { Vulture } from './people.js';
import { TrafficCar } from './vehicles.js';

const JOBS = [
  { name: 'Job 1 — First Wheels', pay: 150, text: 'Steal any car. Parked cars are free; moving ones draw heat.' },
  { name: 'Job 2 — Kurir Panik', pay: 200, text: 'Deliver the package to the Harbor before Dario Kess gets there.' },
  { name: 'Job 3 — Hot Pursuit', pay: 250, text: 'Get to 2 wanted stars, then lose the cops.' },
  { name: 'Job 4 — Harbor Trouble', pay: 300, text: 'Clear the docks: take out 6 Vultures.' },
  { name: 'Job 5 — The Big Score', pay: 500, text: 'Hit Meridian Bank, grab the cash, reach the safehouse.' },
];

const PICKUP_SPOTS = [
  [-45, -112], [90, -45], [-135, 90], [135, 45], [0, -112],
  [-180, 0], [157, -112], [-67, 112],
];

function makeBeacon(scene) {
  const g = new THREE.Group();
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(2.6, 2.6, 42, 14, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffc93b, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false })
  );
  beam.position.y = 21;
  g.add(beam);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.2, 3.4, 24),
    new THREE.MeshBasicMaterial({ color: 0xffc93b, transparent: true, opacity: 0.8, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.15;
  g.add(ring);
  g.visible = false;
  scene.add(g);
  return g;
}

function makePickup(scene, x, z) {
  const g = new THREE.Group();
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.5, 0.6),
    new THREE.MeshLambertMaterial({ color: 0x2e9e4f, emissive: 0x0d5a22 })
  );
  box.position.y = 0.7;
  box.castShadow = true;
  g.add(box);
  const band = new THREE.Mesh(
    new THREE.BoxGeometry(0.94, 0.12, 0.64),
    new THREE.MeshLambertMaterial({ color: 0xf2e6b0 })
  );
  band.position.y = 0.7;
  g.add(band);
  g.position.set(x, 0, z);
  scene.add(g);
  return { mesh: g, x, z, taken: false, respawnT: 0 };
}

export function createMissions(G) {
  const M = {
    index: 0,
    stage: 0,
    timer: 0,
    rival: null,
    vulturesLeft: 0,
    fare: null,
    grabT: 0,
    done: false,
    beacon: makeBeacon(G.scene),
    pickups: PICKUP_SPOTS.map(([x, z]) => makePickup(G.scene, x, z)),
    job() { return JOBS[this.index]; },
    setObjective() {
      const job = this.index < JOBS.length ? JOBS[this.index] : null;
      if (this.fare) {
        G.hud.setObjective('Taxi fare', `Drop your passenger at the marker — ${Math.ceil(this.fare.t)}s left.`);
        return;
      }
      if (!job) {
        G.hud.setObjective('Story complete', 'Solmara is yours. Taxi fares and cash pickups still pay.');
        return;
      }
      let text = job.text;
      if (this.index === 1) text += ` ${Math.ceil(this.timer)}s left.`;
      if (this.index === 2) text = this.stage === 0
        ? 'Get to 2 wanted stars — steal a moving car or shoot near police.'
        : 'Now lose them — get far away until the stars are gone.';
      if (this.index === 3) text = `Clear the docks: take out 6 Vultures. (${6 - this.vulturesLeft} down)`;
      if (this.index === 4) text = this.stage === 0
        ? 'Drive to Meridian Bank (gold tower, downtown).'
        : this.stage === 1 ? 'Press E at the bank doors to grab the cash.'
        : 'Wanted 3! Reach the safehouse in the south-west.';
      G.hud.setObjective(job.name, text);
    },
    startJob(i) {
      this.index = i;
      this.stage = 0;
      this.timer = 0;
      this.grabT = 0;
      if (i === 1) {
        this.timer = 75;
        // Dario Kess races the same route: plaza to harbor.
        this.rival = new TrafficCar(G.scene, [
          { x: -67, z: -40 }, { x: -45, z: 0 }, { x: 0, z: 45 }, { x: 0, z: 150 },
        ], G.rng, 0);
        this.rival.speed = 13;
        this.rival.mesh.children[0].material = new THREE.MeshLambertMaterial({ color: 0x8a1f1f });
        G.cars.traffic.push(this.rival);
      }
      if (i === 3) {
        const spots = [[-80, 158], [-40, 162], [0, 156], [40, 162], [80, 158], [20, 168]];
        for (const [x, z] of spots) {
          const v = new Vulture(G.scene, x, z, G.rng);
          v.mesh.userData.vulture = v;
          G.vultures.push(v);
        }
        this.vulturesLeft = 6;
      }
      this.setObjective();
    },
    complete(pay) {
      G.money += pay;
      G.sounds.jingle();
      const job = JOBS[this.index];
      G.hud.toast(`${job.name} complete — +${fmtCash(pay)}!`);
      this.index += 1;
      this.stage = 0;
      this.timer = 0;
      if (this.index >= JOBS.length) {
        this.done = true;
        this.beacon.visible = false;
        this.setObjective();
        return;
      }
      this.startJob(this.index);
    },
    failJob(why) {
      G.hud.toast(`${why} — try the job again.`);
      this.startJob(this.index);
    },
    onVultureDown() {
      if (this.index !== 3) return;
      this.vulturesLeft = Math.max(0, this.vulturesLeft - 1);
      this.setObjective();
      if (this.vulturesLeft === 0) this.complete(JOBS[3].pay);
    },
    // E pressed: bank grab, taxi start, or nothing (car enter is handled by boot).
    interact() {
      const p = G.player.mesh.position;
      if (this.index === 4 && this.stage === 1) {
        const b = G.city.places.bank;
        if (dist2(p.x, p.z, b.x, b.z) < 9) {
          this.grabT += 0.5;
          G.hud.setHint('Grabbing the cash…');
          if (this.grabT >= 2) {
            this.stage = 2;
            G.wanted.setLevel(3);
            G.hud.toast('Alarms! Wanted 3 — get to the safehouse!');
            this.setObjective();
          }
          return 'grab';
        }
      }
      if (!this.fare) {
        for (const c of G.taxiCustomers) {
          if (c.served || c.knocked) continue;
          const d = dist2(p.x, p.z, c.mesh.position.x, c.mesh.position.z);
          if (d < 3.5) {
            const dests = [G.city.places.beach, G.city.places.downtown, G.city.places.harbor, G.city.places.plaza];
            const dest = dests[Math.floor(Math.random() * dests.length)];
            this.fare = { customer: c, dest, t: 60, pay: 40 + Math.floor(Math.random() * 41) };
            c.served = true;
            c.marker.visible = false;
            G.hud.toast(`Taxi fare — take them to the marker (${fmtCash(this.fare.pay)}).`);
            this.setObjective();
            return 'taxi';
          }
        }
      }
      return null;
    },
    update(dt) {
      const p = G.player.mesh.position;
      // Beacon follows the active objective.
      let target = null;
      if (this.fare) target = this.fare.dest;
      else if (this.index === 1) target = G.city.places.harbor;
      else if (this.index === 3) target = G.city.places.docks;
      else if (this.index === 4) target = this.stage === 2 ? G.city.places.safehouse : G.city.places.bank;
      else if (this.index === 0) target = null;
      if (target) {
        this.beacon.visible = true;
        this.beacon.position.set(target.x, 0, target.z);
        const s = 1 + Math.sin(G.time * 3) * 0.12;
        this.beacon.scale.set(s, 1, s);
      } else {
        this.beacon.visible = false;
      }
      // Pickups: walk over to collect.
      for (const pk of this.pickups) {
        if (pk.taken) {
          pk.respawnT -= dt;
          if (pk.respawnT <= 0) {
            pk.taken = false;
            pk.mesh.visible = true;
          }
          continue;
        }
        pk.mesh.rotation.y += dt * 1.5;
        pk.mesh.position.y = Math.sin(G.time * 2 + pk.x) * 0.15;
        if (dist2(p.x, p.z, pk.x, pk.z) < 2.2) {
          pk.taken = true;
          pk.respawnT = 90;
          pk.mesh.visible = false;
          G.money += 25;
          G.sounds.blip(990);
          G.hud.toast('+ $25 cash pickup');
        }
      }
      // Taxi fare timer + arrival.
      if (this.fare) {
        this.fare.t -= dt;
        if (dist2(p.x, p.z, this.fare.dest.x, this.fare.dest.z) < 9) {
          G.money += this.fare.pay;
          G.sounds.jingle();
          G.hud.toast(`Fare complete — +${fmtCash(this.fare.pay)}!`);
          this.fare = null;
          this.setObjective();
        } else if (this.fare.t <= 0) {
          G.hud.toast('Fare cancelled — too slow.');
          this.fare = null;
          this.setObjective();
        }
      }
      if (this.index >= JOBS.length) return;
      // Job 0: steal any car.
      if (this.index === 0) {
        if (G.player.inCar) this.complete(JOBS[0].pay);
        return;
      }
      // Job 1: race Dario to the harbor.
      if (this.index === 1) {
        this.timer -= dt;
        if (dist2(p.x, p.z, G.city.places.harbor.x, G.city.places.harbor.z) < 10) {
          if (this.rival) {
            G.scene.remove(this.rival.mesh);
            const ri = G.cars.traffic.indexOf(this.rival);
            if (ri >= 0) G.cars.traffic.splice(ri, 1);
            this.rival = null;
          }
          this.complete(JOBS[1].pay);
          return;
        }
        if (this.rival) {
          const rp = this.rival.mesh.position;
          if (dist2(rp.x, rp.z, G.city.places.harbor.x, G.city.places.harbor.z) < 10) {
            this.failJob('Dario Kess beat you to the Harbor');
            return;
          }
        }
        if (this.timer <= 0) {
          this.failJob('Out of time on the delivery');
          return;
        }
        this.setObjective();
        return;
      }
      // Job 2: wanted 2, then lose them.
      if (this.index === 2) {
        if (this.stage === 0 && G.wanted.level >= 2) {
          this.stage = 1;
          G.hud.toast('2 stars! Now lose them.');
          this.setObjective();
        } else if (this.stage === 1 && G.wanted.level === 0) {
          this.complete(JOBS[2].pay);
        }
        return;
      }
      // Job 3: handled by onVultureDown.
      if (this.index === 3) return;
      // Job 4: bank, grab, safehouse.
      if (this.index === 4) {
        if (this.stage === 0 && dist2(p.x, p.z, G.city.places.bank.x, G.city.places.bank.z) < 9) {
          this.stage = 1;
          G.hud.toast('At the bank — press E to grab the cash.');
          this.setObjective();
        } else if (this.stage === 2 && dist2(p.x, p.z, G.city.places.safehouse.x, G.city.places.safehouse.z) < 10) {
          this.complete(JOBS[4].pay);
        }
      }
    },
  };
  M.startJob(0);
  return M;
}
