import { supaServer } from '@/lib/supabase/server'

export type StoryPhoto = { url: string; alt: string; storagePath: string | null }
export type CustomerStory = {
  id: string
  customerName: string
  quote: string
  photos: StoryPhoto[]
  sortOrder: number
  showInGallery: boolean
}

const bundledStories: CustomerStory[] = [
  {
    id: 'ashli-elizabath-chacko', customerName: 'Ashli Elizabath Chacko',
    quote: "Recently I purchased a grape wine color lehanga for rent from Swaasa Bridal Rental shop, Trivandrum. It was really amazing, and affordable. No words to describe the look when I wear it on my engagement day. Thank you Swaasa for your beautiful outfit, support and really amazing team who helped me and my family for the end to end process. I'm really happy and my family too. ❤️",
    photos: [{ url: '/customer-stories/ashli-elizabath-chacko.jpg', alt: 'Ashli and her partner celebrating in a wine-coloured lehenga', storagePath: null }], sortOrder: 10, showInGallery: true,
  },
  {
    id: 'littu-mol', customerName: 'Littu Mol',
    quote: "Rented my reception outfit from @swaasa wedding rentals and I'm SO glad I did... I wore their maroon lehenga with gold embroidery and felt like an absolute queen. The pics came out stunning and it was even prettier in person. So many compliments all night...❤️ The Swaasa team altered it exactly to my measurements. Quality was 10/10. No stains, no loose threads. It was heavy but surprisingly comfy to wear.💃🏻 The girl Sumayya Super sweet and so helpful If you're a Tvm bride looking for a rental, don't think twice. Thank you Swaasa Rentals for making me feel so beautiful on our reception night...❤️💯",
    photos: [{ url: '/customer-stories/littu-mol.jpg', alt: 'Littu celebrating with her partner in a red bridal lehenga', storagePath: null }], sortOrder: 20, showInGallery: true,
  },
  {
    id: 'rohini-devi-r', customerName: 'Rohini Devi R',
    quote: "A big thanks to Swaasa for providing such amazing service and beautiful rental outfits at truly affordable rates. These days, most of us look for quality alternatives for event wear since we may not use them again and Swaasa made that possible without compromising on my dream look. I’m so glad I chose their outfit for my special day. I wouldn’t have been able to afford such a gorgeous lehenga if I had gone for a custom one, but Swaasa gave me that experience at a fraction of the price. The staff were also incredibly empathetic, helpful, and caring, which made the entire service smooth and pleasant. I also loved that they offer semi-stitched options at very budget-friendly prices. Overall, I had a wonderful experience with the boutique and would highly recommend Swaasa to anyone looking for stunning yet affordable outfits and rentals.",
    photos: [{ url: '/customer-stories/rohini-devi-r.jpg', alt: 'Rohini and her partner at their wedding celebration', storagePath: null }], sortOrder: 30, showInGallery: true,
  },
  {
    id: 'malavika', customerName: 'Malavika',
    quote: 'Unscripted moments ; perfectly captured 💗 The dress that stole the show ;thank you so much @swaasa_rentals 🤍 for this beautiful dress 🌷',
    photos: [{ url: '/customer-stories/malavika.jpg', alt: 'Malavika in a pale blue celebration gown', storagePath: null }], sortOrder: 40, showInGallery: true,
  },
  {
    id: 'aswathy-s-nair', customerName: 'Aswathy S Nair',
    quote: 'Obsessed with ……💜 lehanga @swaasa_rentals',
    photos: [{ url: '/customer-stories/aswathy-s-nair.jpg', alt: 'Aswathy in a purple embellished lehenga', storagePath: null }], sortOrder: 50, showInGallery: true,
  },
  {
    id: 'varadha-a', customerName: 'Varadha A',
    quote: '😍😍🔥❤️❤️everyone loved the gown ❤️🔥🔥🔥recieved soo many compliments, Thank you swaasa🔥❤️❤️',
    photos: [
      { url: '/customer-stories/varadha-a-gown-couple.jpg', alt: 'Varadha and her partner celebrating outdoors in a white gown', storagePath: null },
      { url: '/customer-stories/varadha-a-gown-portrait.jpg', alt: 'Varadha in her ivory gown outdoors', storagePath: null },
    ], sortOrder: 60, showInGallery: true,
  },
  {
    id: 'reshma-gopi', customerName: 'Reshma Gopi',
    quote: 'My reception look accidentally turned into a North Indian bridal dream — and I’m not complaining 🤍✨',
    photos: [
      { url: '/customer-stories/reshma-gopi-couple.jpg', alt: 'Reshma and her partner celebrating in a red lehenga', storagePath: null },
      { url: '/customer-stories/reshma-gopi-portrait.jpg', alt: 'Reshma in her red reception lehenga', storagePath: null },
    ], sortOrder: 70, showInGallery: true,
  },
  {
    id: 'reshma-gopi-wedding', customerName: 'Reshma Gopi',
    quote: 'Clothed in grace and surrounded by His love. This was the day God turned a prayer into a promise, and forever began. 🤍✨',
    photos: [
      { url: '/customer-stories/reshma-gopi-wedding-bouquet.jpg', alt: 'Reshma holding a white bouquet in her wedding gown', storagePath: null },
      { url: '/customer-stories/reshma-gopi-wedding-portrait.jpg', alt: 'Reshma in her wedding gown outdoors', storagePath: null },
      { url: '/customer-stories/reshma-gopi-wedding-bouquet-close.jpg', alt: 'Reshma with a bouquet of white flowers in her wedding gown', storagePath: null },
    ], sortOrder: 80, showInGallery: true,
  },
  {
    id: 'pratheeksha-gp-award', customerName: 'Pratheeksha G P',
    quote: 'Asianet Television Award 2026✨️Thanku @swaasa_rentals for the costume ✨️✨️',
    photos: [
      { url: '/customer-stories/pratheeksha-gp-award-full.jpg', alt: 'Pratheeksha at Asianet Television Awards in an ivory embroidered outfit', storagePath: null },
      { url: '/customer-stories/pratheeksha-gp-award-close.jpg', alt: 'Pratheeksha at the event wearing an ivory embroidered outfit', storagePath: null },
      { url: '/customer-stories/pratheeksha-gp-award-portrait.jpg', alt: 'Pratheeksha in full-length ivory occasion wear', storagePath: null },
    ], sortOrder: 90, showInGallery: true,
  },
]

/** Public stories are editable by the owner; bundled entries keep the page present before migration v38 is applied. */
export async function getCustomerStories(): Promise<CustomerStory[]> {
  try {
    const sb = await supaServer()
    const { data, error } = await sb.from('site_customer_stories')
      .select('id, customer_name, quote, image_urls, image_alts, storage_paths, sort_order, show_in_gallery')
      .eq('is_published', true).order('sort_order', { ascending: true }).order('created_at', { ascending: false })
    if (error) {
      console.error('Could not load Customer Stories from Supabase:', error.message)
      return bundledStories
    }
    return (data ?? []).map(row => ({
      id: row.id,
      customerName: row.customer_name,
      quote: row.quote,
      photos: (row.image_urls ?? []).map((url: string, i: number) => ({
        url,
        alt: row.image_alts?.[i] ?? '',
        storagePath: row.storage_paths?.[i] || null,
      })),
      sortOrder: row.sort_order,
      showInGallery: row.show_in_gallery,
    }))
  } catch {
    return bundledStories
  }
}
