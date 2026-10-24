export function avatarInitials(name: string) {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => Array.from(part)[0]).join('').toLocaleUpperCase() || 'U';
}

export function updateAvatar(image: HTMLImageElement | null, initials: HTMLElement | null, name: string, source?: string | null, onPhotoChange?: (visible: boolean) => void) {
  if (initials) { initials.textContent = avatarInitials(name); initials.classList.remove('hidden'); }
  if (!image) return;
  image.classList.add('hidden');
  image.onload = null; image.onerror = null;
  onPhotoChange?.(false);
  let url = '';
  try {
    if (source) {
      const parsed = new URL(source, location.origin);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:' || /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(source)) url = parsed.href;
    }
  } catch { /* Sin URL válida, se conservan las iniciales. */ }
  if (!url) { image.removeAttribute('src'); delete image.dataset.avatarSource; return; }
  image.dataset.avatarSource = url;
  image.referrerPolicy = 'no-referrer';
  image.decoding = 'async';
  image.onload = () => {
    if (image.dataset.avatarSource !== url || !image.naturalWidth) return;
    image.classList.remove('hidden'); initials?.classList.add('hidden'); onPhotoChange?.(true);
  };
  image.onerror = () => {
    if (image.dataset.avatarSource !== url) return;
    image.classList.add('hidden'); initials?.classList.remove('hidden');
    image.onload = null; image.onerror = null; image.removeAttribute('src'); onPhotoChange?.(false);
  };
  if (image.getAttribute('src') !== url) image.src = url;
  if (image.complete && image.naturalWidth > 0) image.onload(new Event('load'));
}
