import { redirect } from 'next/navigation'

// The main link of the site opens the admin dashboard. (Anyone not signed in is sent to the login page by middleware.ts first.)
// The dress collection used for taking a new booking now lives at /collection.
export default function Home() {
  redirect('/admin')
}
