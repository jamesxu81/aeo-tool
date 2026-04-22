import NewProjectForm from './form';

export default function NewProjectPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold">New project</h1>
      <p className="mt-1 text-slate-400">
        Enter your domain, the keywords you want to check in AI search, and up to 2 competitors.
      </p>
      <div className="mt-8">
        <NewProjectForm />
      </div>
    </div>
  );
}
