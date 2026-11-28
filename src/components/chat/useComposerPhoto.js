import { useEffect, useRef, useState } from 'react';

export function useComposerPhoto(disabled) {
  const [imageData, setImageData] = useState(null);
  const [imageError, setImageError] = useState('');
  const [preparing, setPreparing] = useState(false);
  const photoRequest = useRef(0);
  const fileRef = useRef(null);
  useEffect(() => () => { photoRequest.current++; }, []);

  // Welcome/quick-action buttons can open the same image picker while keeping
  // the normal text box available. The custom event fires within the user's
  // button click, so browsers treat it as an intentional file-picker action.
  useEffect(() => {
    const openPicker = () => {
      if (!disabled) fileRef.current?.click();
    };
    window.addEventListener('ecopulse:open-image-picker', openPicker);
    return () => window.removeEventListener('ecopulse:open-image-picker', openPicker);
  }, [disabled]);

  async function handleImageFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = '';
    const request = ++photoRequest.current;
    setPreparing(true);
    setImageError('');
    setImageData(null);
    try {
      const { prepareComposerPhoto } = await import('../../services/composerPhoto.js');
      const prepared = await prepareComposerPhoto(file);
      if (request === photoRequest.current) setImageData(prepared);
    } catch (error) {
      if (request === photoRequest.current) setImageError(error.message || 'Could not prepare this photo.');
    } finally {
      if (request === photoRequest.current) setPreparing(false);
    }
  }

  function clearPhoto() {
    photoRequest.current++;
    setPreparing(false);
    setImageError('');
    setImageData(null);
  }
  return { fileRef, imageData, imageError, preparing, clearPhoto, handleImageFile };
}
