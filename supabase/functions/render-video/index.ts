import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { images, audioUrl, sceneDuration = 5, transition = "fade" } = await req.json();

    const CLOUDINARY_CLOUD_NAME = Deno.env.get("CLOUDINARY_CLOUD_NAME");
    const CLOUDINARY_API_KEY = Deno.env.get("CLOUDINARY_API_KEY");
    const CLOUDINARY_API_SECRET = Deno.env.get("CLOUDINARY_API_SECRET");

    if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
      console.error("Cloudinary credentials not configured");
      return new Response(JSON.stringify({ error: "Video rendering service not configured. Please add Cloudinary API credentials." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate inputs
    if (!images || !Array.isArray(images) || images.length === 0) {
      return new Response(JSON.stringify({ error: "No images provided for video rendering." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (images.length > 10) {
      return new Response(JSON.stringify({ error: "Maximum 10 images allowed per video." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Rendering video with ${images.length} images, ${sceneDuration}s each, transition: ${transition}`);

    // Step 1: Upload each base64 image to Cloudinary
    const uploadedUrls: string[] = [];

    for (let i = 0; i < images.length; i++) {
      const imageData = images[i];
      
      // Create Basic auth header
      const timestamp = Math.floor(Date.now() / 1000);
      
      // Generate signature for upload
      const signatureString = `timestamp=${timestamp}${CLOUDINARY_API_SECRET}`;
      const encoder = new TextEncoder();
      const data = encoder.encode(signatureString);
      const hashBuffer = await crypto.subtle.digest("SHA-1", data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const signature = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");

      const formData = new FormData();
      formData.append("file", imageData);
      formData.append("api_key", CLOUDINARY_API_KEY);
      formData.append("timestamp", timestamp.toString());
      formData.append("signature", signature);
      formData.append("folder", "tubegenius_renders");

      const uploadRes = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
        { method: "POST", body: formData }
      );

      if (!uploadRes.ok) {
        const errText = await uploadRes.text();
        console.error(`Image upload ${i + 1} failed:`, errText);
        throw new Error(`Failed to upload image ${i + 1} to rendering service`);
      }

      const uploadData = await uploadRes.json();
      uploadedUrls.push(uploadData.public_id);
      console.log(`Uploaded image ${i + 1}/${images.length}: ${uploadData.public_id}`);
    }

    // Step 2: Upload audio if provided
    let audioPublicId: string | null = null;
    if (audioUrl) {
      const audioTimestamp = Math.floor(Date.now() / 1000);
      const audioSigString = `resource_type=video&timestamp=${audioTimestamp}${CLOUDINARY_API_SECRET}`;
      const audioData = new TextEncoder().encode(audioSigString);
      const audioHashBuffer = await crypto.subtle.digest("SHA-1", audioData);
      const audioHashArray = Array.from(new Uint8Array(audioHashBuffer));
      const audioSignature = audioHashArray.map(b => b.toString(16).padStart(2, "0")).join("");

      const audioFormData = new FormData();
      audioFormData.append("file", audioUrl);
      audioFormData.append("api_key", CLOUDINARY_API_KEY);
      audioFormData.append("timestamp", audioTimestamp.toString());
      audioFormData.append("signature", audioSignature);
      audioFormData.append("resource_type", "video");
      audioFormData.append("folder", "tubegenius_audio");

      const audioUploadRes = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/video/upload`,
        { method: "POST", body: audioFormData }
      );

      if (audioUploadRes.ok) {
        const audioUploadData = await audioUploadRes.json();
        audioPublicId = audioUploadData.public_id;
        console.log("Audio uploaded:", audioPublicId);
      } else {
        console.warn("Audio upload failed, rendering video without audio");
      }
    }

    // Step 3: Create video using Cloudinary's multi-image slideshow
    // Build transformation for slideshow
    const slideTransformations = uploadedUrls.map((publicId, i) => {
      const transforms = [];
      if (i > 0 && transition === "fade") {
        transforms.push("e_transition");
      }
      transforms.push(`du_${sceneDuration}`);
      return {
        public_id: publicId,
        transformation: transforms.join(","),
        duration: sceneDuration
      };
    });

    // Use Cloudinary's video creation via multi method
    const createTimestamp = Math.floor(Date.now() / 1000);
    const manifest = {
      w: 1920,
      h: 1080,
      du: sceneDuration * uploadedUrls.length,
      vars: {},
    };

    // Build the slideshow URL using Cloudinary URL-based transformations
    const slideshowTag = `tubegenius_${Date.now()}`;
    
    // Create a multi/slideshow resource
    const multiSigString = `tag=${slideshowTag}&timestamp=${createTimestamp}${CLOUDINARY_API_SECRET}`;
    const multiData = new TextEncoder().encode(multiSigString);
    const multiHashBuffer = await crypto.subtle.digest("SHA-1", multiData);
    const multiHashArray = Array.from(new Uint8Array(multiHashBuffer));
    const multiSignature = multiHashArray.map(b => b.toString(16).padStart(2, "0")).join("");

    // Tag all uploaded images
    for (const publicId of uploadedUrls) {
      const tagTimestamp = Math.floor(Date.now() / 1000);
      const tagSigString = `public_id=${publicId}&tag=${slideshowTag}&timestamp=${tagTimestamp}${CLOUDINARY_API_SECRET}`;
      const tagData = new TextEncoder().encode(tagSigString);
      const tagHashBuffer = await crypto.subtle.digest("SHA-1", tagData);
      const tagHashArray = Array.from(new Uint8Array(tagHashBuffer));
      const tagSignature = tagHashArray.map(b => b.toString(16).padStart(2, "0")).join("");

      await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/tags`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            public_ids: [publicId],
            tag: slideshowTag,
            api_key: CLOUDINARY_API_KEY,
            timestamp: tagTimestamp,
            signature: tagSignature,
          }),
        }
      );
    }

    // Generate slideshow video using multi API
    const multiRes = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/multi`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tag: slideshowTag,
          format: "mp4",
          transformation: `w_1920,h_1080,c_fill,du_${sceneDuration}`,
          api_key: CLOUDINARY_API_KEY,
          timestamp: createTimestamp,
          signature: multiSignature,
          notification_url: "", // We'll poll instead
        }),
      }
    );

    if (!multiRes.ok) {
      const errText = await multiRes.text();
      console.error("Multi/slideshow creation failed:", errText);
      throw new Error("Failed to create video slideshow");
    }

    const multiResult = await multiRes.json();
    console.log("Video creation initiated:", multiResult);

    // The URL to the generated video
    const videoUrl = multiResult.secure_url || multiResult.url;

    return new Response(JSON.stringify({ 
      videoUrl,
      status: "complete",
      imageCount: uploadedUrls.length,
      duration: sceneDuration * uploadedUrls.length
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: unknown) {
    console.error("Error in render-video function:", error);
    const errorMessage = error instanceof Error ? error.message : "Video rendering failed";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
