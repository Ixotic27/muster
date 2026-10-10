import { useState } from 'react';
export default function SiteImage({
  src,
  alt,
  ...props
}) {
  const [failed, setFailed] = useState(false);
  return failed ? <div className="image-fallback" role="img" aria-label={alt}>↗</div> : <img src={src} alt={alt} {...props} onError={() => setFailed(true)} />;
}
