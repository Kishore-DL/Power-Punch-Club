const replacements:Record<string,string>={
  "Discipline. Strength. Character.": "Karate Training",
  "Your journey begins with a single step. Book a trial class.": "For class timings and admission details, contact the club.",
  "BUILD YOUR\nINNER WARRIOR.": "Karate Training",
  "More than martial arts. A journey of discipline, confidence and strength — on the mat and beyond.": "View classes, register for tournaments, and see club photos and results.",
  "At Power Punch Club, karate is a practice of continuous growth. Our training brings together technique, physical conditioning and the values of respect, focus and perseverance.": "Power Punch Club provides karate training. Use this website to find class details, register for tournaments and view results.",
  "Karate Foundations": "Beginner Karate",
  "START STRONG": "Beginners",
  "GO FURTHER": "Advanced",
  "MOVE WITH PURPOSE": "Fitness and self-defence",
  "Build confident movement, balance and the fundamentals of karate in a supportive environment.": "Learn basic karate movements, balance and techniques.",
  "Refine your kata, sharpen your kumite and develop the discipline to perform under pressure.": "Practise kata (set movements) and kumite (sparring).",
  "Practical awareness, functional conditioning and techniques that build everyday confidence.": "Learn basic self-defence and improve your fitness.",
  "STRONG ROOTS.\nSTRONGER FUTURES.": "About Power Punch Club",
  "Every student starts somewhere. Our purpose is to help each one grow with focused practice, thoughtful guidance and a community that values effort.": "Read about the club and its karate training.",
  "To make disciplined karate training accessible and help students develop confidence, fitness and character.": "Help students learn karate, improve fitness and practise safely.",
  "Respect. Focus. Perseverance. Humility.": "Respect others. Stay focused. Practise regularly.",
  "Have a question about training, admissions or a tournament? We would love to hear from you.": "Contact the club for class timings, admission details or tournament questions.",
  "Club dojo": "Club training centre",
  "Explore karate training, meet our masters, and discover tournaments at Power Punch Club.": "Find karate classes, tournament registration, results and contact details for Power Punch Club."
};
export function plainStarterCopy(value:any):any{if(typeof value==='string')return replacements[value]??value;if(Array.isArray(value))return value.map(plainStarterCopy);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,plainStarterCopy(v)]));return value}
