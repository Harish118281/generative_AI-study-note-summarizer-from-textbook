import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import './LandingPage.css'

type LandingPageProps = {
  onLogin: () => void
  onSignup: () => void
}

function StudyScene() {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
    } catch {
      host.classList.add('study-scene-fallback')
      return
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75))
    renderer.setClearColor(0x000000, 0)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.domElement.setAttribute('aria-hidden', 'true')
    host.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100)
    camera.position.set(0, 0.2, 9.3)
    scene.add(new THREE.HemisphereLight(0xe8f7ff, 0x7e879b, 2.2))
    const keyLight = new THREE.DirectionalLight(0xffffff, 3.2)
    keyLight.position.set(-3, 5, 6)
    keyLight.castShadow = true
    scene.add(keyLight)
    const rimLight = new THREE.PointLight(0x46d4c5, 22, 12)
    rimLight.position.set(3, 1, 4)
    scene.add(rimLight)

    const workspace = new THREE.Group()
    scene.add(workspace)

    const makePanelTexture = (kind: 'main' | 'image' | 'video') => {
      const canvas = document.createElement('canvas')
      canvas.width = 1200
      canvas.height = 760
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#f8fbfd'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      if (kind === 'main') {
        ctx.fillStyle = '#10212c'
        ctx.fillRect(0, 0, 1200, 82)
        ctx.fillStyle = '#54d3c5'
        ctx.beginPath()
        ctx.roundRect(35, 24, 38, 38, 11)
        ctx.fill()
        ctx.fillStyle = '#ffffff'
        ctx.font = '600 28px Arial'
        ctx.fillText('Study AI', 88, 55)
        ctx.fillStyle = '#eaf0f4'
        ctx.fillRect(0, 82, 268, 678)
        ctx.fillStyle = '#6b7880'
        ctx.font = '500 19px Arial'
        ctx.fillText('YOUR LIBRARY', 32, 132)
        for (let i = 0; i < 5; i += 1) {
          ctx.fillStyle = i === 1 ? '#d8f3ef' : '#eef2f3'
          ctx.beginPath()
          ctx.roundRect(24, 158 + i * 72, 218, 50, 12)
          ctx.fill()
          ctx.fillStyle = i === 1 ? '#147d72' : '#52616b'
          ctx.fillRect(43, 176 + i * 72, 12, 12)
          ctx.fillText(['New chat', 'Physics notes', 'Control systems', 'Saved files', 'Study plan'][i], 70, 190 + i * 72)
        }
        ctx.fillStyle = '#20313c'
        ctx.font = '600 36px Arial'
        ctx.fillText('How does a DC motor work?', 316, 156)
        ctx.fillStyle = '#667782'
        ctx.font = '24px Arial'
        ctx.fillText('A simple explanation from your study material', 316, 201)
        for (let i = 0; i < 4; i += 1) {
          ctx.fillStyle = '#89979f'
          ctx.fillRect(316, 253 + i * 43, 700 - (i % 2) * 80, 10)
        }
        ctx.fillStyle = '#fffaf0'
        ctx.beginPath()
        ctx.roundRect(318, 457, 790, 226, 20)
        ctx.fill()
        ctx.strokeStyle = '#dae2e3'
        ctx.lineWidth = 3
        ctx.stroke()
        ctx.strokeStyle = '#71818a'
        ctx.lineWidth = 7
        ctx.beginPath()
        ctx.moveTo(506, 576)
        ctx.lineTo(907, 576)
        ctx.stroke()
        ctx.fillStyle = '#e75e51'
        ctx.beginPath()
        ctx.arc(528, 576, 43, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#248dcc'
        ctx.beginPath()
        ctx.arc(887, 576, 43, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#273944'
        ctx.font = '600 20px Arial'
        ctx.fillText('Magnetic field', 636, 510)
        ctx.fillStyle = '#ffffff'
        ctx.font = '600 24px Arial'
        ctx.fillText('N', 516, 584)
        ctx.fillText('S', 879, 584)
        ctx.fillStyle = '#50606a'
        ctx.font = '20px Arial'
        ctx.fillText('Diagram generated from your notes', 580, 647)
      } else if (kind === 'image') {
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, 1200, 760)
        ctx.fillStyle = '#17252f'
        ctx.font = '600 38px Arial'
        ctx.fillText('Generate image', 62, 68)
        ctx.fillStyle = '#eaf0f5'
        ctx.beginPath()
        ctx.roundRect(52, 112, 1096, 600, 28)
        ctx.fill()
        ctx.fillStyle = '#c7d3df'
        ctx.beginPath()
        ctx.roundRect(434, 580, 330, 70, 24)
        ctx.fill()
        ctx.fillStyle = '#253a4a'
        ctx.beginPath()
        ctx.roundRect(545, 335, 120, 250, 28)
        ctx.fill()
        ctx.fillStyle = '#364e61'
        ctx.beginPath()
        ctx.roundRect(516, 275, 178, 80, 30)
        ctx.fill()
        ctx.beginPath()
        ctx.roundRect(550, 212, 108, 78, 24)
        ctx.fill()
        ctx.beginPath()
        ctx.roundRect(573, 170, 62, 75, 18)
        ctx.fill()
        ctx.strokeStyle = '#596f81'
        ctx.lineWidth = 28
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(535, 294)
        ctx.lineTo(438, 240)
        ctx.lineTo(394, 330)
        ctx.lineTo(474, 387)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(673, 295)
        ctx.lineTo(759, 235)
        ctx.lineTo(815, 326)
        ctx.lineTo(731, 383)
        ctx.stroke()
        ;[[438, 240], [394, 330], [759, 235], [815, 326], [605, 194]].forEach(([x, y]) => {
          ctx.fillStyle = '#172b3b'
          ctx.beginPath()
          ctx.arc(x, y, 33, 0, Math.PI * 2)
          ctx.fill()
          ctx.fillStyle = '#75a1b6'
          ctx.beginPath()
          ctx.arc(x, y, 12, 0, Math.PI * 2)
          ctx.fill()
        })
        ctx.fillStyle = '#ffffff'
        ctx.beginPath()
        ctx.roundRect(82, 630, 240, 48, 15)
        ctx.fill()
        ctx.fillStyle = '#526573'
        ctx.font = '22px Arial'
        ctx.fillText('Robot arm · generated', 100, 662)
      } else {
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, 1200, 760)
        ctx.fillStyle = '#17252f'
        ctx.font = '600 38px Arial'
        ctx.fillText('Generate video', 62, 68)
        ctx.fillStyle = '#101820'
        ctx.beginPath()
        ctx.roundRect(52, 112, 1096, 600, 28)
        ctx.fill()
        ctx.fillStyle = '#344454'
        ctx.beginPath()
        ctx.arc(600, 393, 196, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#d68a4b'
        ctx.beginPath()
        ctx.arc(600, 393, 132, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#19232e'
        ctx.beginPath()
        ctx.arc(600, 393, 93, 0, Math.PI * 2)
        ctx.fill()
        for (let i = 0; i < 10; i += 1) {
          const angle = (Math.PI * 2 * i) / 10
          ctx.save()
          ctx.translate(600 + Math.cos(angle) * 163, 393 + Math.sin(angle) * 163)
          ctx.rotate(angle)
          ctx.fillStyle = '#b66b36'
          ctx.fillRect(-23, -16, 46, 32)
          ctx.restore()
        }
        ctx.fillStyle = 'rgba(255,255,255,.92)'
        ctx.beginPath()
        ctx.arc(600, 393, 52, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#17252f'
        ctx.beginPath()
        ctx.moveTo(590, 367)
        ctx.lineTo(590, 419)
        ctx.lineTo(628, 393)
        ctx.closePath()
        ctx.fill()
        ctx.fillStyle = '#ffffff'
        ctx.beginPath()
        ctx.roundRect(82, 630, 240, 48, 15)
        ctx.fill()
        ctx.fillStyle = '#526573'
        ctx.font = '22px Arial'
        ctx.fillText('Motor animation · 0:24', 100, 662)
      }

      const texture = new THREE.CanvasTexture(canvas)
      texture.colorSpace = THREE.SRGBColorSpace
      texture.anisotropy = 8
      return texture
    }

    const makeCard = (
      width: number,
      height: number,
      texture: THREE.Texture,
      position: THREE.Vector3,
      rotation: THREE.Euler,
      depth = 0.16,
    ) => {
      const group = new THREE.Group()
      const frame = new THREE.Mesh(
        new THREE.BoxGeometry(width + 0.12, height + 0.12, depth),
        new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.27, metalness: 0.12 }),
      )
      frame.castShadow = true
      frame.receiveShadow = true
      group.add(frame)

      const face = new THREE.Mesh(
        new THREE.PlaneGeometry(width, height),
        new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }),
      )
      face.position.z = depth / 2 + 0.002
      group.add(face)
      group.position.copy(position)
      group.rotation.copy(rotation)
      workspace.add(group)
      return group
    }

    const mainCard = makeCard(
      5.9,
      3.72,
      makePanelTexture('main'),
      new THREE.Vector3(-0.52, 0.08, 0),
      new THREE.Euler(-0.06, -0.14, -0.025),
      0.22,
    )
    makeCard(
      2.12,
      1.64,
      makePanelTexture('image'),
      new THREE.Vector3(3.7, 1.25, 0.58),
      new THREE.Euler(-0.06, -0.25, 0.025),
      0.14,
    )
    makeCard(
      2.12,
      1.64,
      makePanelTexture('video'),
      new THREE.Vector3(3.72, -1.13, 0.65),
      new THREE.Euler(0.04, -0.24, -0.035),
      0.12,
    )

    const book = new THREE.Group()
    const cover = new THREE.Mesh(
      new THREE.BoxGeometry(2.48, 0.11, 1.55),
      new THREE.MeshStandardMaterial({ color: '#0c3438', roughness: 0.42 }),
    )
    cover.position.y = -1.57
    cover.rotation.x = -0.04
    book.add(cover)
    const pages = new THREE.Mesh(
      new THREE.BoxGeometry(2.38, 0.12, 1.45),
      new THREE.MeshStandardMaterial({ color: '#fff8e9', roughness: 0.8 }),
    )
    pages.position.set(0, -1.49, 0.02)
    book.add(pages)
    book.position.set(0.25, -0.13, -0.6)
    book.rotation.set(-0.06, -0.2, -0.025)
    book.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = true
        object.receiveShadow = true
      }
    })
    workspace.add(book)

    const blocks = [
      { position: [-2.82, -0.91, -0.3], size: 0.24, color: '#dd795d', rotation: [0.3, 0.4, 0.1] },
      { position: [2.88, 1.35, -0.4], size: 0.2, color: '#e3b044', rotation: [0.1, 0.5, 0.3] },
      { position: [1.98, 1.91, -0.6], size: 0.15, color: '#35a795', rotation: [0.2, 0.2, 0.2] },
    ] as const

    blocks.forEach(({ position, size, color, rotation }) => {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(size, size, size),
        new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.16 }),
      )
      mesh.position.set(position[0], position[1], position[2])
      mesh.rotation.set(rotation[0], rotation[1], rotation[2])
      mesh.castShadow = true
      workspace.add(mesh)
    })

    const resize = () => {
      const width = host.clientWidth || 1
      const height = host.clientHeight || 1
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.position.z = width < 560 ? 13.4 : 8.6
      camera.updateProjectionMatrix()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(host)
    resize()

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const pointer = new THREE.Vector2()
    const handlePointer = (event: PointerEvent) => {
      const bounds = host.getBoundingClientRect()
      pointer.x = ((event.clientX - bounds.left) / bounds.width - 0.5) * 2
      pointer.y = ((event.clientY - bounds.top) / bounds.height - 0.5) * 2
    }
    host.addEventListener('pointermove', handlePointer)
    const clock = new THREE.Clock()
    let frameId = 0
    const render = () => {
      const time = clock.getElapsedTime()
      if (!reducedMotion) {
        workspace.position.y = Math.sin(time * 0.65) * 0.07
        workspace.rotation.y += (pointer.x * -0.13 - workspace.rotation.y) * 0.045
        workspace.rotation.x += (pointer.y * 0.075 - workspace.rotation.x) * 0.045
        workspace.position.x += (pointer.x * 0.16 - workspace.position.x) * 0.035
        mainCard.rotation.z = -0.025 + Math.sin(time * 0.35) * 0.008
      }
      renderer.render(scene, camera)
      frameId = window.requestAnimationFrame(render)
    }
    render()

    return () => {
      window.cancelAnimationFrame(frameId)
      observer.disconnect()
      host.removeEventListener('pointermove', handlePointer)
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose()
          const materials = Array.isArray(object.material) ? object.material : [object.material]
          materials.forEach((material) => {
            if (material instanceof THREE.MeshBasicMaterial && material.map) material.map.dispose()
            material.dispose()
          })
        }
      })
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [])

  return <div className="study-scene" ref={hostRef} aria-label="3D study workspace illustration" />
}

const features = [
  { number: '01', title: 'Ask questions', detail: 'Get clear explanations for the things you are learning.', color: 'mint' },
  { number: '02', title: 'Upload documents', detail: 'Ask questions from PDFs, notes, and textbooks.', color: 'coral' },
  { number: '03', title: 'Generate images', detail: 'Create diagrams and visual explanations for ideas.', color: 'gold' },
  { number: '04', title: 'Generate videos', detail: 'Bring concepts to life with short learning videos.', color: 'lilac' },
  { number: '05', title: 'Summarize', detail: 'Turn chapters into key points and study notes.', color: 'mint' },
  { number: '06', title: 'Code help', detail: 'Understand, write, and debug code in many languages.', color: 'coral' },
]

function LandingPage({ onLogin, onSignup }: LandingPageProps) {
  return (
    <main className="landing-page">
      <header className="landing-nav">
        <a className="landing-brand" href="#home" aria-label="Study AI home">
          <span className="brand-glyph" aria-hidden="true">S</span>
          <span className="brand-copy"><strong>Study<span>AI</span></strong><small>Learn smarter, go further</small></span>
        </a>
        <nav className="landing-links" aria-label="Main navigation">
          <a className="is-current" href="#home">Home</a>
          <a href="#features">Features</a>
          <a href="#how-it-works">How it works</a>
          <a href="#about">About</a>
        </nav>
        <div className="landing-nav-actions">
          <button className="landing-login" onClick={onLogin} type="button">Log in</button>
          <button className="landing-signup" onClick={onSignup} type="button">Sign up</button>
        </div>
      </header>

      <section className="landing-hero" id="home">
        <div className="hero-copy">
          <span className="hero-eyebrow"><i /> Your personal AI learning space</span>
          <h1>Turn study material into <span>meaningful learning.</span></h1>
          <p>Ask questions, explore your notes, and make difficult ideas easier to understand, all in one place.</p>
          <div className="hero-actions">
            <button className="hero-primary" onClick={onSignup} type="button">Get started <span aria-hidden="true">→</span></button>
            <button className="hero-secondary" onClick={onLogin} type="button">Log in</button>
          </div>
          <div className="hero-promises" aria-label="Study AI benefits">
            <span><b>✓</b> Start for free</span>
            <span><b>✓</b> Your files, organized</span>
            <span><b>✓</b> Learn at your pace</span>
          </div>
        </div>
        <div className="hero-visual" aria-hidden="true">
          <StudyScene />
        </div>
      </section>

      <section className="features-section" id="features">
        <div className="section-heading">
          <span className="section-kicker">A better way to study</span>
          <h2>Everything you need to make progress</h2>
        </div>
        <div className="feature-grid">
          {features.map((feature) => (
            <article className={`feature-item feature-${feature.color}`} key={feature.number}>
              <span className="feature-number">{feature.number}</span>
              <h3>{feature.title}</h3>
              <p>{feature.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="how-section" id="how-it-works">
        <div className="how-intro">
          <span className="section-kicker">Simple by design</span>
          <h2>From question to understanding</h2>
        </div>
        <ol className="how-steps">
          <li><span>1</span><div><strong>Upload or ask</strong><p>Bring your notes or start with a question.</p></div></li>
          <li><span>2</span><div><strong>AI understands</strong><p>Find the relevant ideas in your material.</p></div></li>
          <li><span>3</span><div><strong>Get explanation</strong><p>Learn with clear answers and visual examples.</p></div></li>
          <li><span>4</span><div><strong>Learn better</strong><p>Review, practice, and build understanding.</p></div></li>
        </ol>
      </section>

      <footer className="landing-footer" id="about">
        <a className="landing-brand footer-brand" href="#home">
          <span className="brand-glyph" aria-hidden="true">S</span>
          <span className="brand-copy"><strong>Study<span>AI</span></strong><small>Learn smarter, go further</small></span>
        </a>
        <p>Make room for the ideas you’re learning.</p>
        <button onClick={onSignup} type="button">Create your account <span aria-hidden="true">→</span></button>
      </footer>
    </main>
  )
}

export default LandingPage
