export function readImage(dataURL) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(Error("Could not decode the photo."));
    img.src = dataURL;
  });
}
export async function loadLocalPhoto(file) {
  if (!file || !["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw Error("Choose a JPEG, PNG or WebP photo.");
  if (file.size > 20 * 1024 * 1024)
    throw Error("Choose a photo smaller than 20 MB.");
  const original = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(Error("Could not read the photo."));
    reader.readAsDataURL(file);
  });
  const image = await readImage(original),
    ratio = Math.min(
      1,
      2048 / Math.max(image.naturalWidth, image.naturalHeight),
    ),
    c = document.createElement("canvas");
  c.width = Math.round(image.naturalWidth * ratio);
  c.height = Math.round(image.naturalHeight * ratio);
  const ctx = c.getContext("2d");
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(image, 0, 0, c.width, c.height);
  const dataURL = c.toDataURL("image/jpeg", 0.9),
    normalized = await readImage(dataURL);
  const width = Math.min(
    10,
    (7.7 * normalized.naturalWidth) / normalized.naturalHeight,
  );
  if (width < 0.1)
    throw Error("Choose a photo with a less extreme aspect ratio.");
  return {
    image: normalized,
    data: {
      id: crypto.randomUUID(),
      name: file.name,
      dataURL,
      width,
      x: 6 - width / 2,
      y: 0,
      opacity: 0.7,
      visible: true,
      blockOpacity: 0.3,
    },
  };
}
export function validatePhoto(data) {
  if (
    !data ||
    typeof data.id !== "string" ||
    data.id.length > 100 ||
    typeof data.name !== "string" ||
    data.name.length > 300 ||
    typeof data.dataURL !== "string" ||
    data.dataURL.length > 8 * 1024 * 1024 ||
    !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(
      data.dataURL,
    ) ||
    ![data.width, data.x, data.y, data.opacity, data.blockOpacity].every(
      Number.isFinite,
    ) ||
    data.width < 0.1 ||
    data.width > 50 ||
    Math.abs(data.x) > 50 ||
    Math.abs(data.y) > 50 ||
    data.opacity < 0 ||
    data.opacity > 1 ||
    data.blockOpacity < 0 ||
    data.blockOpacity > 1 ||
    typeof data.visible !== "boolean"
  )
    throw Error("Invalid embedded photo or placement.");
}
export async function restorePhoto(data) {
  validatePhoto(data);
  const image = await readImage(data.dataURL);
  if ((data.width * image.naturalHeight) / image.naturalWidth > 100)
    throw Error("Photo height must not exceed 100 m.");
  return { image, data: { ...data } };
}
export function photoBounds(photo) {
  const { x, y, width } = photo.data;
  return {
    left: x,
    right: x + width,
    bottom: y,
    top: y + (width * photo.image.naturalHeight) / photo.image.naturalWidth,
  };
}
export function transformTracedSpecs(
  specs,
  oldPlacement,
  newPlacement,
  photoId,
) {
  const ratio = newPlacement.width / oldPlacement.width;
  return specs.map((s) =>
    s.photoId !== photoId
      ? s
      : {
          ...s,
          x: newPlacement.x + (s.x - oldPlacement.x) * ratio,
          y: newPlacement.y + (s.y - oldPlacement.y) * ratio,
          r: s.r * ratio,
          vertices: s.vertices.map((v) => v * ratio),
        },
  );
}
