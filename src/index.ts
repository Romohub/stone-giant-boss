// Stone Giant v2 — Game Over 2026 — aiming for 5 stars on all 7 criteria
// Paste as src/index.ts in Creator Hub, replacing v1, then PLAY.
// v2 adds, vs v1:
//  1. Boss Design: bigger giant, glowing lava cracks, big emissive eye,
//     brow + jaw, taunts per phase, eye colour yellow -> orange -> red
//  2. Boss Mechanics: rocks now TARGET the player and DAMAGE you
//  3. Gameplay: player HP 3, 5:00 timer, clear HUD, Play Again button
//  4. Challenge & Victory: lose if HP 0 or time runs out; on win the
//     giant FALLS APART piece by piece + explosion rocks + big YOU WIN
//  5. Creativity: giant taunts you, phase 3 is a red enrage
//  6. World Design: torches, lava cracks, dark arena, red enrage lighting
//     NOTE: delete the default red/yellow trees in the Creator Hub editor —
//     they are not in this code, they came with the default scene.
//  7. Technical: pillars are boxes (v1 cylinders looked tilted in preview),
//     rocks are capped + always cleaned up, fewer entities, no extra assets.

import {
  engine,
  Transform,
  MeshRenderer,
  MeshCollider,
  Material,
  TextShape,
  pointerEventsSystem,
  InputAction
} from '@dcl/sdk/ecs'
import { Color4, Vector3 } from '@dcl/sdk/math'

const HITS_TO_WIN = 3
const PLAYER_MAX_HP = 3
const TIME_LIMIT = 300 // 5:00 — the whole fight must fit in 5 minutes
const PHASE_TIMING: Array<[number, number]> = [
  [2.5, 7.5], // Phase 1: 10s cycle
  [2.0, 4.0], // Phase 2: 6s cycle
  [1.5, 2.5] // Phase 3: 4s cycle — enrage
]
const TAUNTS = [
  'You are just a pebble!',
  'My rocks will crush you!',
  'NO! Not my eye!'
]
const EYE_COLORS = [
  Color4.create(1, 0.85, 0.1, 1), // yellow
  Color4.create(1, 0.55, 0.1, 1), // orange
  Color4.create(1, 0.15, 0.1, 1) // red
]

const STONE = Color4.create(0.55, 0.55, 0.58, 1)
const STONE_DARK = Color4.create(0.35, 0.35, 0.38, 1)
const FLOOR_COLOR = Color4.create(0.3, 0.28, 0.26, 1)
const LAVA = Color4.create(1, 0.4, 0.05, 1)
const EYE_CLOSED = Color4.create(0.15, 0.15, 0.16, 1)
const EYE_HIT = Color4.create(1, 0.2, 0.1, 1)

// ---------- State ----------
let hits = 0
let phase = 1
let playerHp = PLAYER_MAX_HP
let timeLeft = TIME_LIMIT
let eyeOpen = false
let eyeTimer = 0
let invulnTimer = 0
let won = false
let lost = false
let winTimer = 0
let lastStatusSecond = -1

type Rock = { entity: number; vy: number }
const rocks: Rock[] = []
const giantParts: number[] = []
const borderWalls: number[] = []

function box(
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
  color: Color4,
  emissive = false
) {
  const e = engine.addEntity()
  Transform.create(e, {
    position: Vector3.create(x, y, z),
    scale: Vector3.create(sx, sy, sz)
  })
  MeshRenderer.setBox(e)
  Material.setPbrMaterial(e, {
    albedoColor: color,
    emissiveColor: color,
    emissiveIntensity: emissive ? 1.2 : 0
  })
  return e
}

function sphere(
  x: number,
  y: number,
  z: number,
  s: number,
  color: Color4,
  emissive = false
) {
  const e = engine.addEntity()
  Transform.create(e, {
    position: Vector3.create(x, y, z),
    scale: Vector3.create(s, s, s)
  })
  MeshRenderer.setSphere(e)
  Material.setPbrMaterial(e, {
    albedoColor: color,
    emissiveColor: color,
    emissiveIntensity: emissive ? 1.5 : 0
  })
  return e
}

function setEyeColor(color: Color4, eye: number) {
  Material.setPbrMaterial(eye, {
    albedoColor: color,
    emissiveColor: color,
    emissiveIntensity: eyeOpen ? 2 : 0.2
  })
}

function playerPos(): { x: number; z: number } {
  const t = Transform.getOrNull(engine.PlayerEntity)
  if (!t) return { x: 8, z: 3 }
  return { x: t.position.x, z: t.position.z }
}

export function main() {
  // ---------- Arena ----------
  box(8, 0.05, 8, 16, 0.1, 16, FLOOR_COLOR)
  // Lava cracks on the floor — thin glowing orange strips
  box(5, 0.12, 6, 3, 0.02, 0.3, LAVA, true)
  box(11, 0.12, 10, 3, 0.02, 0.3, LAVA, true)
  box(8, 0.12, 8, 0.3, 0.02, 4, LAVA, true)

  // Border walls (kept to recolour red in Phase 3)
  borderWalls.push(box(8, 0.4, 0.4, 16, 0.8, 0.8, STONE_DARK))
  borderWalls.push(box(8, 0.4, 15.6, 16, 0.8, 0.8, STONE_DARK))
  borderWalls.push(box(0.4, 0.4, 8, 0.8, 0.8, 16, STONE_DARK))
  borderWalls.push(box(15.6, 0.4, 8, 0.8, 0.8, 16, STONE_DARK))

  // Pillars — BOXES in v2 (v1 cylinders looked tilted in preview)
  box(3, 1, 4, 1, 2, 1, STONE)
  box(13, 1, 4, 1, 2, 1, STONE)
  box(3, 1, 12, 1, 2, 1, STONE)
  box(13, 1, 12, 1, 2, 1, STONE)

  // Torches in the 4 corners: pole + glowing flame
  const torchSpots: Array<[number, number]> = [
    [2, 2],
    [14, 2],
    [2, 14],
    [14, 14]
  ]
  for (const [tx, tz] of torchSpots) {
    box(tx, 0.75, tz, 0.2, 1.5, 0.2, STONE_DARK)
    sphere(tx, 1.7, tz, 0.45, LAVA, true)
  }

  // ---------- Stone Giant — bigger, with lava cracks, brow + jaw ----------
  // Legs, body, arms, head — all tracked so they can fall apart on win
  giantParts.push(box(7.3, 0.7, 12, 0.9, 1.4, 0.9, STONE_DARK))
  giantParts.push(box(8.7, 0.7, 12, 0.9, 1.4, 0.9, STONE_DARK))
  giantParts.push(box(8, 2.7, 12, 2.6, 2.8, 1.4, STONE))
  giantParts.push(box(6.6, 2.7, 12, 0.7, 2.3, 0.7, STONE_DARK))
  giantParts.push(box(9.4, 2.7, 12, 0.7, 2.3, 0.7, STONE_DARK))
  giantParts.push(box(8, 4.8, 12, 1.7, 1.4, 1.4, STONE))
  // Brow + jaw make it read as a face, not just boxes
  giantParts.push(box(8, 5.3, 11.4, 1.6, 0.3, 0.4, STONE_DARK))
  giantParts.push(box(8, 4.0, 11.4, 1.0, 0.3, 0.4, STONE_DARK))
  // Glowing lava cracks on the chest + head
  box(8, 2.7, 11.28, 0.25, 1.8, 0.05, LAVA, true)
  box(7.6, 4.8, 11.28, 0.2, 0.8, 0.05, LAVA, true)
  // Shoulder spikes
  giantParts.push(box(6.8, 4.2, 12, 0.6, 0.6, 0.6, STONE_DARK))
  giantParts.push(box(9.2, 4.2, 12, 0.6, 0.6, 0.6, STONE_DARK))

  // Eye — BIG, front of head, clickable
  const eye = engine.addEntity()
  Transform.create(eye, {
    position: Vector3.create(8, 4.8, 11.3),
    scale: Vector3.create(0.95, 0.95, 0.95)
  })
  MeshRenderer.setSphere(eye)
  MeshCollider.setBox(eye)
  setEyeColor(EYE_CLOSED, eye)
  giantParts.push(eye)

  // ---------- Text: title, taunt, HUD ----------
  const title = engine.addEntity()
  Transform.create(title, { position: Vector3.create(8, 3.0, 5.5) })
  TextShape.create(title, {
    text: 'STONE GIANT\nWait for the eye to open — then CLICK it!',
    fontSize: 2,
    textColor: Color4.White()
  })

  const taunt = engine.addEntity()
  Transform.create(taunt, { position: Vector3.create(8, 5.8, 10) })
  TextShape.create(taunt, {
    text: TAUNTS[0],
    fontSize: 2,
    textColor: Color4.create(1, 0.6, 0.3, 1)
  })

  const status = engine.addEntity()
  Transform.create(status, { position: Vector3.create(8, 3.8, 6.5) })
  TextShape.create(status, {
    text: 'HP: 3/3  |  Hits: 0/3  |  Time: 5:00  |  Phase 1',
    fontSize: 2,
    textColor: Color4.create(1, 0.85, 0.1, 1)
  })

  const victory = engine.addEntity()
  Transform.create(victory, {
    position: Vector3.create(8, 5.5, 8),
    scale: Vector3.create(0.01, 0.01, 0.01)
  })
  TextShape.create(victory, {
    text: 'YOU WIN!\nThe Stone Giant is broken!',
    fontSize: 5,
    textColor: Color4.create(0.4, 1, 0.4, 1)
  })

  const loseText = engine.addEntity()
  Transform.create(loseText, {
    position: Vector3.create(8, 5.5, 8),
    scale: Vector3.create(0.01, 0.01, 0.01)
  })
  TextShape.create(loseText, {
    text: 'YOU LOSE!\nThe Giant crushed you...',
    fontSize: 5,
    textColor: Color4.create(1, 0.3, 0.3, 1)
  })

  // Play Again button — a real clickable box, shown only on win/lose
  const againBtn = box(8, 3.8, 7, 2.4, 0.7, 0.2, Color4.create(0.2, 0.6, 0.2, 1))
  Transform.getMutable(againBtn).scale = Vector3.create(0.01, 0.01, 0.01)
  MeshCollider.setBox(againBtn)
  const againLabel = engine.addEntity()
  Transform.create(againLabel, {
    position: Vector3.create(8, 3.8, 6.85),
    scale: Vector3.create(0.01, 0.01, 0.01)
  })
  TextShape.create(againLabel, {
    text: 'PLAY AGAIN',
    fontSize: 2,
    textColor: Color4.White()
  })

  function fmtTime(s: number) {
    const m = Math.floor(Math.max(0, s) / 60)
    const sec = Math.floor(Math.max(0, s) % 60)
    return `${m}:${sec < 10 ? '0' : ''}${sec}`
  }

  function updateStatus() {
    const sec = Math.ceil(timeLeft)
    if (sec === lastStatusSecond && !won && !lost) return
    lastStatusSecond = sec
    TextShape.getMutable(status).text = won
      ? 'YOU WIN!  Hits: 3/3'
      : lost
        ? 'YOU LOSE — click PLAY AGAIN'
        : `HP: ${playerHp}/3  |  Hits: ${hits}/3  |  Time: ${fmtTime(timeLeft)}  |  Phase ${phase}  |  Eye: ${eyeOpen ? 'OPEN!' : 'CLOSED'}`
  }

  function showAgainButton() {
    Transform.getMutable(againBtn).scale = Vector3.create(2.4, 0.7, 0.2)
    Transform.getMutable(againLabel).scale = Vector3.create(1, 1, 1)
  }

  function hideAgainButton() {
    Transform.getMutable(againBtn).scale = Vector3.create(0.01, 0.01, 0.01)
    Transform.getMutable(againLabel).scale = Vector3.create(0.01, 0.01, 0.01)
  }

  function resetGame() {
    hits = 0
    phase = 1
    playerHp = PLAYER_MAX_HP
    timeLeft = TIME_LIMIT
    eyeOpen = false
    eyeTimer = 0
    invulnTimer = 0
    won = false
    lost = false
    winTimer = 0
    lastStatusSecond = -1
    for (const r of rocks) engine.removeEntity(r.entity)
    rocks.length = 0
    // Restore the giant
    for (const p of giantParts) {
      Transform.getMutable(p).scale = Vector3.create(1, 1, 1)
    }
    Transform.getMutable(eye).scale = Vector3.create(0.95, 0.95, 0.95)
    Transform.getMutable(eye).position = Vector3.create(8, 4.8, 11.3)
    setEyeColor(EYE_CLOSED, eye)
    Transform.getMutable(victory).scale = Vector3.create(0.01, 0.01, 0.01)
    Transform.getMutable(loseText).scale = Vector3.create(0.01, 0.01, 0.01)
    Transform.getMutable(title).scale = Vector3.create(1, 1, 1)
    TextShape.getMutable(taunt).text = TAUNTS[0]
    hideAgainButton()
    updateStatus()
  }

  function loseGame() {
    if (won || lost) return
    lost = true
    eyeOpen = false
    setEyeColor(EYE_CLOSED, eye)
    Transform.getMutable(loseText).scale = Vector3.create(1, 1, 1)
    showAgainButton()
    updateStatus()
  }

  function winGame() {
    won = true
    winTimer = 0
    updateStatus()
    Transform.getMutable(victory).scale = Vector3.create(1, 1, 1)
    Transform.getMutable(title).scale = Vector3.create(0.01, 0.01, 0.01)
    showAgainButton()
    // Explosion: 8 rocks burst out from the giant
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2
      const e = sphere(
        8 + Math.cos(a) * 1.5,
        3 + Math.random() * 2,
        12 + Math.sin(a) * 1.5,
        0.5,
        STONE_DARK
      )
      rocks.push({ entity: e, vy: 2 })
    }
  }

  function spawnRock(targetPlayer: boolean) {
    if (rocks.length >= 6) return // cap — keeps FPS up
    const p = playerPos()
    const rx = targetPlayer
      ? Math.max(1, Math.min(15, p.x + (Math.random() - 0.5) * 2))
      : 4 + Math.random() * 8
    const rz = targetPlayer
      ? Math.max(1, Math.min(15, p.z + (Math.random() - 0.5) * 2))
      : 4 + Math.random() * 6
    const rock = engine.addEntity()
    Transform.create(rock, {
      position: Vector3.create(rx, 6.5, rz),
      scale: Vector3.create(0.7, 0.7, 0.7)
    })
    MeshRenderer.setSphere(rock)
    Material.setPbrMaterial(rock, { albedoColor: STONE_DARK })
    rocks.push({ entity: rock, vy: phase === 3 ? 5.5 : 3.5 })
  }

  // ---------- Click the eye ----------
  pointerEventsSystem.onPointerDown(
    {
      entity: eye,
      opts: {
        button: InputAction.IA_POINTER,
        hoverText: 'HIT THE EYE!'
      }
    },
    () => {
      if (won || lost || !eyeOpen) return
      hits++
      setEyeColor(EYE_HIT, eye)
      if (hits >= HITS_TO_WIN) {
        winGame()
        return
      }
      phase = hits + 1
      eyeOpen = false
      eyeTimer = 0
      setEyeColor(EYE_CLOSED, eye)
      TextShape.getMutable(taunt).text = TAUNTS[phase - 1]
      // Phase 3 enrage: borders go red
      if (phase === 3) {
        for (const w of borderWalls) {
          Material.setPbrMaterial(w, {
            albedoColor: Color4.create(0.6, 0.1, 0.1, 1)
          })
        }
      }
      updateStatus()
      spawnRock(true)
    }
  )

  // ---------- Play Again ----------
  pointerEventsSystem.onPointerDown(
    {
      entity: againBtn,
      opts: { button: InputAction.IA_POINTER, hoverText: 'Play again' }
    },
    () => {
      if (won || lost) resetGame()
    }
  )

  // ---------- Game loop ----------
  engine.addSystem((dt: number) => {
    if (invulnTimer > 0) invulnTimer -= dt

    if (won) {
      // Giant falls apart piece by piece
      winTimer += dt
      const idx = Math.floor(winTimer / 0.25)
      if (idx < giantParts.length) {
        const part = giantParts[idx]
        const t = Transform.getMutable(part)
        t.position.y -= dt * 2
        if (winTimer > 1.5) t.scale = Vector3.create(0.01, 0.01, 0.01)
      }
      // Explosion rocks keep falling, then clean up
      for (let i = rocks.length - 1; i >= 0; i--) {
        const t = Transform.getMutable(rocks[i].entity)
        t.position.y -= rocks[i].vy * dt
        if (t.position.y <= 0.4) {
          engine.removeEntity(rocks[i].entity)
          rocks.splice(i, 1)
        }
      }
      return
    }
    if (lost) return

    // Timer — 5:00 limit
    timeLeft -= dt
    if (timeLeft <= 0) {
      timeLeft = 0
      updateStatus()
      loseGame()
      return
    }
    updateStatus()

    // Eye timer
    eyeTimer += dt
    const [openFor, closedFor] = PHASE_TIMING[phase - 1]
    const cycle = openFor + closedFor
    const shouldBeOpen = eyeTimer % cycle < openFor
    if (shouldBeOpen !== eyeOpen) {
      eyeOpen = shouldBeOpen
      setEyeColor(eyeOpen ? EYE_COLORS[phase - 1] : EYE_CLOSED, eye)
      updateStatus()
      if (!eyeOpen && phase >= 2) spawnRock(true)
    }

    // Falling rocks — damage if they land near the player
    const p = playerPos()
    for (let i = rocks.length - 1; i >= 0; i--) {
      const rock = rocks[i]
      const t = Transform.getMutable(rock.entity)
      t.position.y -= rock.vy * dt
      if (t.position.y <= 0.4) {
        const dx = t.position.x - p.x
        const dz = t.position.z - p.z
        if (invulnTimer <= 0 && dx * dx + dz * dz < 1.44) {
          playerHp--
          invulnTimer = 1
          updateStatus()
          if (playerHp <= 0) {
            loseGame()
          }
        }
        engine.removeEntity(rock.entity)
        rocks.splice(i, 1)
      }
    }
  })

  updateStatus()
}
