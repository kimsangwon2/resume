import express from "express";
import { prisma } from "../models/index.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import authMiddleware from "../middlewares/need-signin.middleware.js";
import dotenv from "dotenv";
import axios from "axios";
import qs from "qs";
const router = express.Router();

//회원가입 API
router.post("/sign-up", async (req, res, next) => {
  try {
    const { email, password, checkpass, name, grade } = req.body;
    const isExistUser = await prisma.users.findFirst({
      where: { email },
    });
    if (isExistUser) {
      return res.status(409).json({ message: "이미 존재하는 이메일입니다." });
    }
    if (password != checkpass) {
      return res
        .status(401)
        .json({ message: "비밀번호가 일치한지 확인해주세요" });
    }
    if (password.length < 6) {
      return res
        .status(401)
        .json({ message: "비밀번호가 6자 이상인지 확인해주세요" });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.users.create({
      data: {
        email,
        password: hashedPassword,
        checkpass: hashedPassword,
        name,
        grade,
      },
      select: {
        email: true,
        password: false,
        checkpass: false,
        name: true,
        grade: true,
      },
    });
    return res.status(201).json({ data: user });
  } catch (err) {
    next(err);
  }
});

//로그인API
router.post("/sign-in", async (req, res, next) => {
  const { email, password } = req.body;
  dotenv.config();
  const SECRETKEY = process.env.SECRETKEY;
  const SECRET_KEY = process.env.SECRET_KEY;

  const user = await prisma.users.findFirst({ where: { email } });
  if (!user)
    return res.status(401).json({ message: "존재하지 않는 이메일입니다" });
  if (!(await bcrypt.compare(password, user.password)))
    return res.status(401).json({ message: "비밀번호가 일치하지 않습니다" });

  const accesstoken = jwt.sign({ userId: user.userId }, SECRETKEY, {
    expiresIn: "12h",
  });
  const refreshtoken = jwt.sign({ userId: user.userId }, SECRET_KEY, {
    expiresIn: "7d",
  });
  res.cookie("authorization", `Bearer ${accesstoken}`);
  res.cookie("refreshtoken", `Bearer ${refreshtoken}`);
  return res.status(200).json({ accesstoken, refreshtoken });
});

//사용자 정보 조회API
router.get("/users", authMiddleware, async (req, res, next) => {
  const { userId } = res.locals.user;

  const user = await prisma.users.findFirst({
    where: { userId: +userId },
    select: {
      userId: true,
      email: true,
      name: true,
      createdAt: true,
      grade: true,
    },
  });
  return res.status(200).json({ data: user });
});

//카카오 로그인 인가 코드 받기
router.get("/kakao", async (req, res, next) => {
  const url = `https://kauth.kakao.com/oauth/authorize?response_type=code&client_id=${process.env.RESTAPI}&redirect_uri=${process.env.REDIRECTURI}`;
  res.redirect(url);
});

//카카오 토큰 받기
router.get("/kakao/callback", async (req, res, next) => {
  try {
    const kakao = {
      clientID: process.env.RESTAPI,
      clientSecret: process.env.CLIENTSECRET,
      redirectUri: process.env.REDIRECTURI,
    };
    const token = await axios({
      method: "POST",
      url: "https://kauth.kakao.com/oauth/token",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      data: qs.stringify({
        grant_type: "authorization_code",
        client_id: kakao.clientID,
        client_secret: kakao.clientSecret,
        redirectUri: kakao.redirectUri,
        code: req.query.code,
      }),
    });
  } catch (error) {
    res.json(error.data);
  }
  let user = await axios({
    method: "get",
    url: "https://kapi.kakao.com/v2/user/me",
    headers: {
      Authorization: `Bearer ${token.data.access_token}`,
    },
  });
  req.seesion.kakao = user.data;
});

export default router;
