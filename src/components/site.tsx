import Link from "next/link";

/* ---------- brand ---------- */
/** The Monumental wordmark (official logo, inherits color via currentColor). */
export function Logo({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 118 27" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Monumental">
      <g fill="currentColor" clipPath="url(#mlogo)">
        <path d="M118 22.15v3.584h-8.946V.427h4.407v21.724H118ZM101.452 18.635h1.822l-.795-10.057-1.027 10.057ZM105.097.427l3.379 25.24h-4.44l-.332-3.517h-2.618l-.332 3.518h-3.677l3.281-25.24h4.739ZM98.429.427v3.484h-3.48v21.822h-4.406V3.912h-3.445V.427h11.33ZM86.391.427v25.306h-3.248l-3.278-12.981v12.981H76.22V.427h3.71l2.817 11.207V.427h3.644ZM75.471 22.184v3.484h-8.946V.428h8.912V3.91h-4.506v7h3.744v3.55H70.93v7.723h4.54ZM65.26.427v25.306h-4.243V13.902L59.13 25.734h-2.717l-1.988-11.832v11.832H50.78V.427h5.104l2.02 14.888L60.29.427h4.97ZM49.653.427v20.344c0 3.517-2.188 5.292-5.434 5.292s-5.4-1.775-5.4-5.258V.427h4.373V21.23c0 .953.498 1.446 1.26 1.446.696 0 .994-.493.994-1.48V.428h4.208-.001ZM37.682.427v25.306h-3.248l-3.28-12.981v12.981h-3.645V.427h3.71l2.818 11.207V.427h3.645ZM22.106 21.33V4.733c0-.986-.564-1.38-1.093-1.38-.663 0-1.127.395-1.127 1.38v16.563c0 .953.43 1.38 1.16 1.38.661 0 1.06-.395 1.06-1.348v.002Zm4.373-15.743v14.888c0 4.14-2.485 5.588-5.434 5.588-2.948 0-5.567-1.545-5.567-5.588V5.587C15.48 1.48 18.064 0 21.046 0c2.981 0 5.434 1.446 5.434 5.587ZM14.479.427v25.306h-4.241V13.902L8.35 25.734H5.633L3.645 13.901v11.832H0V.427h5.102l2.022 14.888L9.51.427h4.97Z" />
      </g>
      <defs><clipPath id="mlogo"><path fill="#fff" d="M0 0h118v26.061H0z" /></clipPath></defs>
    </svg>
  );
}

/* ---------- structural primitives ---------- */
/** Empty 6-column module band — the signature horizontal rule row. */
export function GridBand() {
  return (
    <div className="grid-band">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} />
      ))}
    </div>
  );
}

/** Tall heading block with the title indented ~one grid column. */
export function PageHead({ title }: { title: string }) {
  return (
    <div className="page-head">
      <h1 className="display">{title}</h1>
    </div>
  );
}

export function TopBar({
  links,
  onDark = false,
  absolute = false,
}: {
  links: { label: string; href: string }[];
  onDark?: boolean;
  absolute?: boolean;
}) {
  return (
    <nav
      className={`topbar${onDark ? " on-dark" : ""}`}
      style={absolute ? { position: "absolute", top: 0, left: 0, right: 0, zIndex: 2 } : undefined}
    >
      <Link className="wordmark" href="/" aria-label="Monumental — home">
        <Logo className="wordmark-logo" />
      </Link>
      <div className="topnav">
        {links.map((l) => (
          <Link key={l.label} href={l.href}>{l.label}</Link>
        ))}
      </div>
    </nav>
  );
}

/** Giant full-width wordmark rendered from the official logo. */
export function MegaMark() {
  return (
    <div className="megamark">
      <Logo className="megamark-logo" />
    </div>
  );
}

function ContactRow({ title, action, href = "#" }: { title: string; action: string; href?: string }) {
  return (
    <Link className="footer-row" href={href}>
      <span className="footer-row__ttl">{title}</span>
      <span className="footer-row__action">{action} ›</span>
    </Link>
  );
}

/** Full-bleed orange footer: CTA block + contact rows, then the giant wordmark. */
export function Footer() {
  return (
    <footer className="footer">
      <div className="shell">
        <GridBand />
        <div className="footer-cta">
          <div className="footer-cta__left">
            <h2 className="h2">Curious about the possibilities for your project?</h2>
            <p>Monumental is now operating in the Netherlands.</p>
            <Button variant="ghost">Learn more</Button>
          </div>
          <div className="footer-cta__right">
            <ContactRow title="E-mail" action="hello@monumental.co" />
            <ContactRow title="We're hiring" action="Join us" />
            <ContactRow title="Call us" action="+31 20 30 86 636" />
          </div>
        </div>
        <MegaMark />
        <div className="footer-links">
          <div>
            <Link href="#">Join us on Substack</Link>
            <span className="label">Stay updated</span>
          </div>
          <div>
            <div>
              <Link href="#">LinkedIn</Link>
              <Link href="#">X</Link>
              <Link href="#">Instagram</Link>
              <Link href="#">YouTube</Link>
            </div>
            <span className="label">Follow us</span>
          </div>
          <div>
            <Link href="#">We&apos;re hiring</Link>
            <span className="label">Work</span>
          </div>
          <div>
            <div>
              <Link href="#">NL</Link>
              <Link href="#">UK</Link>
            </div>
            <span className="label">Navigate</span>
          </div>
          <div>
            <Link href="#">Privacy policy</Link>
            <span className="label">Monumental © 2026</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

/* ---------- content components ---------- */
export function Button({
  children,
  href = "#",
  variant = "primary",
}: {
  children: React.ReactNode;
  href?: string;
  variant?: "primary" | "ghost" | "orange";
}) {
  const cls = variant === "ghost" ? "btn btn-ghost" : variant === "orange" ? "btn btn-orange" : "btn";
  return <Link className={cls} href={href}>{children}</Link>;
}

export function Tile({ src, title, tag }: { src: string; title: string; tag?: string }) {
  return (
    <Link className="tile" href="#">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" />
      <span className="tile-cap">
        {tag && <span className="eyebrow" style={{ display: "block", marginBottom: ".3rem" }}>{tag}</span>}
        <span className="ttl">{title}</span>
      </span>
    </Link>
  );
}

export function Hero({
  eyebrow,
  title,
  media,
  nav,
}: {
  eyebrow: string;
  title: string;
  media: string;
  nav: React.ReactNode;
}) {
  return (
    <header className="hero">
      <div className="hero-media">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={media} alt="" />
      </div>
      <div className="hero-grid" />
      <div className="hero-inner">
        {nav}
        <p className="eyebrow" style={{ color: "var(--color-cream)" }}>{eyebrow}</p>
        <h1 className="display" style={{ color: "var(--color-cream)", maxWidth: "18ch" }}>{title}</h1>
      </div>
    </header>
  );
}
