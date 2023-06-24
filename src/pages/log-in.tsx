import { useState } from "react";
import Link from "next/link";
import AuthLayout from "~/components/layouts/AuthLayout";
import { useFormik } from "formik";
import TextInput from "~/components/UI/TextInput";
import InputFeedback from "~/components/UI/InputFeedback";
import { validateLogIn } from "~/utils/formValidation";

export default function LogIn() {
  const [showPassword, setShowPassword] = useState(false);

  const formik = useFormik({
    initialValues: {
      email: "",
      password: "",
    },
    validate: validateLogIn,
    onSubmit: (values) => {
      alert(JSON.stringify(values, null, 2));
    },
  });

  const handleGoogleLogin = () => {
    console.log("google login");
  };

  const handlWorldCoinLogIn = () => {
    console.log("worldcoin login");
  };

  return (
    <AuthLayout>
      <h1 className="mb-3 font-display text-6xl font-bold text-white 2xs:text-7xl xl:text-8xl 2xl:text-9xl">
        Log In
      </h1>
      <p className="mb-7 text-beige md:text-lg xl:mb-10">
        Don&apos;t have an account?{" "}
        <Link href="/sign-up" className="text-gradient">
          Sign Up.
        </Link>
      </p>
      <form onSubmit={formik.handleSubmit}>
        <div className="mb-5 md:mb-6">
          <TextInput
            id="email"
            name="email"
            type="email"
            placeholder="Email"
            value={formik.values.email}
            onChange={formik.handleChange}
            onBlur={formik.handleBlur}
          />
          {formik.touched.email && formik.errors.email && (
            <InputFeedback state="error">{formik.errors.email}</InputFeedback>
          )}
        </div>
      </form>
    </AuthLayout>
  );
}
